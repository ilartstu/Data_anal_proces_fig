"""Pydantic request/response schemas."""
from __future__ import annotations

from pydantic import BaseModel, Field


class Deletion(BaseModel):
    column: str | None = None     # None => blank all columns in the range
    start_idx: int
    end_idx: int


class InterpConfig(BaseModel):
    """Linear-interpolation of gaps / outliers (part of the working copy)."""
    enabled: bool = False
    gaps: bool = False            # interpolate short runs of NaN/zeros
    gap_min: int = 5              # only runs with length > gap_min
    gap_max: int = 24             # ... and length <= gap_max
    gap_nan: bool = True
    gap_zeros: bool = False
    outliers: bool = False        # interpolate detected outliers (any length)
    outlier_method: str = "zscore"
    outlier_params: dict = Field(default_factory=lambda: {"threshold": 3.5})


class Edits(BaseModel):
    """Non-destructive working-copy edits, applied on every read.

    Applied in order: rename columns, drop columns (by current name), drop rows
    (0-based positions in the parsed data), blank deleted cells, interpolate.
    The file on disk is never modified — edits are re-applied on every read.
    """
    renames: dict[str, str] = Field(default_factory=dict)   # original -> new
    drop_columns: list[str] = Field(default_factory=list)
    drop_rows: list[int] = Field(default_factory=list)
    deletions: list[Deletion] = Field(default_factory=list)
    interpolate: InterpConfig = Field(default_factory=InterpConfig)


class ParseConfig(BaseModel):
    id: str
    sheet: str | None = None
    header_row: int = 0
    skip_after: int = 0
    edits: Edits = Field(default_factory=Edits)


class InspectRequest(ParseConfig):
    pass


class RowsRequest(ParseConfig):
    offset: int = 0
    limit: int = 100
    x_col: str | None = None


class AnomalyConfig(BaseModel):
    method: str = "none"          # none | zscore | iqr | diff | rolling
    params: dict = Field(default_factory=dict)


class ResampleConfig(BaseModel):
    rule: str | None = None       # e.g. "1h", "1D", "1W"; None = raw
    agg: str = "mean"             # mean | sum | min | max | median | first | last


class SeriesRequest(ParseConfig):
    x_col: str | None = None
    y_cols: list[str] = Field(default_factory=list)
    resample: ResampleConfig = Field(default_factory=ResampleConfig)
    anomaly: AnomalyConfig = Field(default_factory=AnomalyConfig)
    detect_zeros: bool = True
    sort_x: bool = False
    max_points: int = 150_000


class ExportRequest(ParseConfig):
    x_col: str | None = None
    y_cols: list[str] = Field(default_factory=list)
    resample: ResampleConfig = Field(default_factory=ResampleConfig)
    fmt: str = "csv"              # csv | xlsx
    dropna: bool = False
    drop_empty_rows: bool = False
    sort_x: bool = False


class OutliersRequest(ParseConfig):
    x_col: str | None = None
    y_cols: list[str] = Field(default_factory=list)   # empty => all numeric
    method: str = "zscore"
    params: dict = Field(default_factory=lambda: {"threshold": 3.5})


class CorrelationRequest(ParseConfig):
    x_col: str | None = None
    y_cols: list[str] = Field(default_factory=list)
    resample: ResampleConfig = Field(default_factory=ResampleConfig)
    method: str = "pearson"       # pearson | spearman | kendall


class StatsRequest(ParseConfig):
    x_col: str | None = None
    y_cols: list[str] = Field(default_factory=list)
    resample: ResampleConfig = Field(default_factory=ResampleConfig)
    fmt: str = "csv"              # csv | xlsx


class BlocksRequest(ParseConfig):
    x_col: str | None = None
    y_cols: list[str] = Field(default_factory=list)   # empty => all columns
    min_length: int = 24
    kinds: list[str] = Field(default_factory=lambda: ["nan", "zeros"])


class SpectrumRequest(ParseConfig):
    x_col: str | None = None
    y_cols: list[str] = Field(default_factory=list)
    method: str = "fft"          # fft | acf
    max_lag: int = 168           # for acf (samples)
    max_points: int = 4000       # cap for fft output


class MissingRequest(ParseConfig):
    x_col: str | None = None
    buckets: int = 240
    kind: str = "nan"            # nan | zeros | both


class CombineSource(BaseModel):
    id: str
    sheet: str | None = None
    header_row: int = 0
    skip_after: int = 0
    x_col: str | None = None
    label: str
    edits: Edits = Field(default_factory=Edits)


class CombineRequest(BaseModel):
    sources: list[CombineSource]
    time_label: str = "Время"
