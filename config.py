import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# App settings
APP_NAME = "CreatorViewerApp"
APP_VERSION = "0.1.0"

# MongoDB settings
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb+srv://ras:0LaW2j7QI6TEaF3w@cluster0.notuyfr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0")
DATABASE_NAME = os.getenv("DATABASE_NAME", "creator_viewer_app")

# JWT settings
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-for-development")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

# Points system
DEFAULT_POINTS_PER_MINUTE = 10  # Default points earned per minute of watching