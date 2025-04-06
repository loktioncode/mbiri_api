import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import connect_and_init_db
from routers import auth, users, videos, analytics

app = FastAPI(
    title="Creator-Viewer Platform API",
    description="API for a platform connecting content creators with viewers",
    version="0.1.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(videos.router)
app.include_router(analytics.router)


@app.on_event("startup")
async def startup_db_client():
    await connect_and_init_db()

@app.on_event("shutdown")
async def shutdown_db_client():
    pass  # Close any connections if needed

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "message": "API is running"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)