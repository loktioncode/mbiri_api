from motor.motor_asyncio import AsyncIOMotorClient
from config import MONGODB_URL, DATABASE_NAME

# MongoDB client instance
client = AsyncIOMotorClient(MONGODB_URL)
database = client[DATABASE_NAME]

# Collections
users_collection = database.users
videos_collection = database.videos
views_collection = database.views


# Indexes setup
async def create_indexes():
    # User indexes
    await users_collection.create_index("email", unique=True)
    await users_collection.create_index("username", unique=True)

    # Video indexes
    await videos_collection.create_index("creator_id")
    await videos_collection.create_index("youtube_id", unique=True)

    # Views indexes
    await views_collection.create_index([("video_id", 1), ("viewer_id", 1)])


async def connect_and_init_db():
    try:
        # Verify connection is successful
        await client.admin.command('ping')
        print("Connected to MongoDB!")

        # Setup indexes
        await create_indexes()
        print("Database indexes created!")
    except Exception as e:
        print(f"Error connecting to database: {e}")
        raise e