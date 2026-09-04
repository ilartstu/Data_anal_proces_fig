# Figures — команды для сервера/локали.
# Использование: make <цель>   (например: make up)

COMPOSE = docker compose

.PHONY: help build up down restart logs ps clean deploy pull rebuild backend-logs frontend-logs

help:            ## Показать список команд
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

build:           ## Собрать образы
	$(COMPOSE) build

up:              ## Собрать и запустить в фоне (сайт на :8080)
	$(COMPOSE) up -d --build

down:            ## Остановить и удалить контейнеры
	$(COMPOSE) down

restart:         ## Перезапустить контейнеры
	$(COMPOSE) restart

logs:            ## Логи всех сервисов (Ctrl+C для выхода)
	$(COMPOSE) logs -f

backend-logs:    ## Логи только backend
	$(COMPOSE) logs -f backend

frontend-logs:   ## Логи только frontend
	$(COMPOSE) logs -f frontend

ps:              ## Статус контейнеров
	$(COMPOSE) ps

clean:           ## Остановить и удалить контейнеры + тома (загрузки)
	$(COMPOSE) down -v

pull:            ## Забрать последние изменения из git
	git pull --ff-only

deploy: pull up  ## Обновить с git и пересобрать (git pull + up)
	@echo "Готово. Сайт: http://<IP-сервера>:8080"

rebuild:         ## Пересобрать без кеша (если что-то залипло)
	$(COMPOSE) build --no-cache && $(COMPOSE) up -d
