"""brainstorm_server's real app, minus its lifespan.

The lifespan checks Neo4j and starts the graph and relay consumers, none of which
login or the passkey vault touch. Everything those paths do — routers, auth,
Postgres, Redis — is the production code, from whichever checkout is on
PYTHONPATH.
"""

from contextlib import asynccontextmanager

from app.api import app


@asynccontextmanager
async def _no_background_work(_app):
    yield


app.router.lifespan_context = _no_background_work
