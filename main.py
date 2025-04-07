import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from database import connect_and_init_db
from routers import auth, users, videos, analytics

app = FastAPI(
    title="Creator-Viewer Platform API",
    description="API for a platform connecting content creators with viewers",
    version="0.1.0"
)

# Configure CORS - allow requests from localhost:3000 and other development origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(videos.router)
app.include_router(analytics.router)

# Add a catch-all route for 404 errors to help debug
@app.exception_handler(404)
async def custom_404_handler(request: Request, exc):
    route = request.url.path
    method = request.method
    print(f"NOT FOUND: {method} {route}")
    return JSONResponse(
        status_code=404,
        content={
            "detail": "Route not found",
            "path": route,
            "method": method,
            "available_routes": [
                {"path": "/api/videos/{video_id}/duration", "methods": ["PUT"]},
                {"path": "/api/videos/{video_id}/watch", "methods": ["POST"]},
                {"path": "/api/videos/{video_id}", "methods": ["GET", "PUT", "DELETE"]},
                {"path": "/api/videos/discover", "methods": ["GET"]},
                {"path": "/api/videos/my-videos", "methods": ["GET"]},
                {"path": "/api/videos", "methods": ["POST"]},
                # Add other routes as needed
            ]
        }
    )

@app.on_event("startup")
async def startup_db_client():
    await connect_and_init_db()

@app.on_event("shutdown")
async def shutdown_db_client():
    pass  # Close any connections if needed

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "message": "API is running"}

@app.get("/api/routes")
async def list_routes():
    """Debug endpoint to list all available routes"""
    routes = []
    for route in app.routes:
        if hasattr(route, "path") and hasattr(route, "methods"):
            routes.append({
                "path": route.path,
                "methods": list(route.methods),
                "name": getattr(route, "name", None),
            })
    return {"routes": routes}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)