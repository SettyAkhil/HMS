import os
from celery import Celery, Task
from flask import Flask


def celery_init_app(app: Flask) -> Celery:
    class FlaskTask(Task):
        def __call__(self, *args: object, **kwargs: object) -> object:
            with app.app_context():
                return self.run(*args, **kwargs)

    celery_app = Celery(app.name, task_cls=FlaskTask)

    # Configure Celery
    redis_url = (
        os.getenv("CELERY_BROKER_URL")
        or os.getenv("REDIS_URL")
        or "redis://localhost:6379/0"
    )
    celery_app.config_from_object(
        {
            "broker_url": redis_url,
            "result_backend": redis_url,
            "task_ignore_result": False,
        }
    )

    # app.config["TESTING"] isn't set yet the first time this runs (conftest.py reloads the
    # app module before flipping that flag), so also honor an env var that test setup can
    # export before app.py is ever imported.
    testing_env = os.getenv("CELERY_TASK_ALWAYS_EAGER", "").strip().lower() in (
        "1",
        "true",
        "yes",
    )
    if app.config.get("TESTING") or testing_env:
        celery_app.conf.update(task_always_eager=True, task_eager_propagates=False)

    celery_app.set_default()
    app.extensions["celery"] = celery_app
    return celery_app
