"""Reading CSV / Excel files with a user-selectable header row.

The key requirement: the real header is not always on the first line
(e.g. Open-Meteo CSVs put metadata on lines 1-2, a blank line, then the
header on line 4). So we expose the *raw* first rows to let the user pick
which row index is the header, and parse accordingly.
"""
from __future__ import annotations

import csv
import io
from pathlib import Path

import pandas as pd

from .storage import Upload

PREVIEW_ROWS = 40
_CSV_EXTS = {".csv", ".txt", ".tsv"}
_EXCEL_EXTS = {".xlsx", ".xls", ".xlsm"}


def _read_bytes(path: Path) -> bytes:
    return path.read_bytes()


def _decode(raw: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "cp1251", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1", errors="replace")


def detect_delimiter(sample_text: str) -> str:
    """Sniff the CSV delimiter from a text sample; default to comma."""
    # Look at the first non-empty lines only.
    lines = [ln for ln in sample_text.splitlines() if ln.strip()][:20]
    sample = "\n".join(lines)
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
        return dialect.delimiter
    except Exception:
        counts = {d: sample.count(d) for d in [",", ";", "\t", "|"]}
        best = max(counts, key=counts.get)
        return best if counts[best] > 0 else ","


def is_excel(up: Upload) -> bool:
    return up.ext.lower() in _EXCEL_EXTS


def list_sheets(up: Upload) -> list[str]:
    if is_excel(up):
        xls = pd.ExcelFile(up.path)
        return list(xls.sheet_names)
    return []


def raw_preview(up: Upload, sheet: str | None,
                n: int = PREVIEW_ROWS) -> dict:
    """Return the first `n` rows with no header assumption, as strings.

    Used by the frontend to let the user click the header row.
    """
    if is_excel(up):
        df = pd.read_excel(up.path, sheet_name=sheet or 0,
                           header=None, nrows=n, dtype=object)
        df = df.where(pd.notna(df), None)
        rows = [["" if v is None else str(v) for v in r]
                for r in df.values.tolist()]
    else:
        # Use the csv module so ragged rows (metadata lines with fewer
        # columns than the header) don't break parsing.
        text = _decode(_read_bytes(up.path))
        delim = up.delimiter or detect_delimiter(text)
        reader = csv.reader(io.StringIO(text), delimiter=delim)
        rows = []
        for i, row in enumerate(reader):
            if i >= n:
                break
            rows.append([str(c) for c in row])
    ncols = max((len(r) for r in rows), default=0)
    rows = [r + [""] * (ncols - len(r)) for r in rows]
    return {"rows": rows, "ncols": ncols,
            "suggested_header": _guess_header_row(rows)}


def _guess_header_row(rows: list[list[str]]) -> int:
    """Heuristic: among rows that look like text headers, pick the one
    followed by the *longest run* of mostly-numeric data rows. This
    correctly skips metadata blocks (e.g. Open-Meteo puts lat/lon on row 0
    but the real header — followed by thousands of data rows — on row 3).
    """
    def is_data_cell(s: str) -> bool:
        """A cell that belongs to a data row: number, NaN/empty token, or a
        date/time-looking string (has digits and a - / : separator)."""
        s = s.strip()
        if s == "" or s.lower() in {"nan", "na", "null", "none"}:
            return True
        try:
            float(s.replace(",", "."))
            return True
        except ValueError:
            pass
        return any(ch.isdigit() for ch in s) and any(sep in s for sep in "-/:")

    def is_data_row(row: list[str]) -> bool:
        nonempty = [c for c in row if c.strip() != ""]
        if not nonempty:
            return False
        return sum(1 if is_data_cell(c) else 0 for c in nonempty) / len(nonempty) >= 0.6

    def is_blank(row: list[str]) -> bool:
        return all(c.strip() == "" for c in row)

    best_row, best_run = 0, -1
    for i, row in enumerate(rows[:15]):
        nonempty = [c for c in row if c.strip() != ""]
        if len(nonempty) < 2 or is_data_row(row):
            continue                     # header rows are text, not data
        run = 0
        for j in range(i + 1, len(rows)):
            if is_data_row(rows[j]):
                run += 1
            elif is_blank(rows[j]):
                continue                 # tolerate blank separator rows
            else:
                break
        if run > best_run:
            best_run, best_row = run, i
    return best_row


def _normalize_names(cols) -> list[str]:
    """Final column names: keep as-is (incl. pandas `Unnamed: N`), name blanks
    `col_N`. Every column is kept so the user can delete/rename any of them."""
    out = []
    for i, c in enumerate(cols):
        s = str(c).strip()
        out.append(s if s else f"col_{i}")
    return out


def resolve_columns(up: Upload, sheet: str | None, header_row: int,
                    skip_after: int = 0) -> list[str]:
    """The final parsed column name for each column position, aligned 1:1 with
    the header-row cells. No column is dropped, so even blank/unnamed columns
    get a stable name (`Unnamed: N` / `col_N`) and can be deleted/renamed."""
    if is_excel(up):
        df = pd.read_excel(up.path, sheet_name=sheet or 0, header=header_row)
    else:
        text = _decode(_read_bytes(up.path))
        delim = up.delimiter or detect_delimiter(text)
        body = "\n".join(text.splitlines()[header_row:])
        df = pd.read_csv(io.StringIO(body), header=0, sep=delim,
                         skip_blank_lines=False, engine="python")
    if skip_after > 0:
        df = df.iloc[skip_after:]
    return _normalize_names(df.columns)


def read_dataframe(up: Upload, sheet: str | None, header_row: int,
                   skip_after: int = 0) -> pd.DataFrame:
    """Parse the full file using the given 0-based header row index.

    `skip_after` drops N rows immediately after the header (e.g. a units
    row) before the data begins.
    """
    if up.ext.lower() == ".pkl":            # combined dataset (fast fallback)
        return pd.read_pickle(up.path)
    if is_excel(up):
        df = pd.read_excel(up.path, sheet_name=sheet or 0, header=header_row)
    else:
        text = _decode(_read_bytes(up.path))
        delim = up.delimiter or detect_delimiter(text)
        # Drop everything before the header row first, so ragged metadata
        # lines (fewer columns than the data) never reach the parser.
        body = "\n".join(text.splitlines()[header_row:])
        df = pd.read_csv(io.StringIO(body), header=0, sep=delim,
                         skip_blank_lines=False, engine="python")
    if skip_after > 0:
        df = df.iloc[skip_after:]
    # Keep every column (incl. blank/unnamed) so the user can delete/rename any.
    # Empty unnamed columns are auto-hidden by the frontend (restorable).
    df.columns = _normalize_names(df.columns)
    df = df.reset_index(drop=True)
    return df
