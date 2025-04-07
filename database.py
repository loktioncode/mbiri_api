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
    try:
        # User indexes
        await users_collection.create_index("email", unique=True)
        await users_collection.create_index("username", unique=True)

        # Video indexes
        await videos_collection.create_index("creator_id")
        await videos_collection.create_index("youtube_id", unique=True)

        # For the views collection, we need to clean up any duplicate entries first
        # before creating the unique index
        print("Cleaning up duplicate view records...")
        
        # First, drop any existing unique index to avoid conflicts
        try:
            await views_collection.drop_index("viewer_video_unique_idx")
            print("Dropped existing views index")
        except Exception as drop_err:
            print(f"Note: {drop_err}")
        
        # Find all view combinations
        pipeline = [
            {"$group": {
                "_id": {"video_id": "$video_id", "viewer_id": "$viewer_id"},
                "count": {"$sum": 1},
                "docs": {"$push": {"_id": "$_id", "watch_duration": "$watch_duration", "points_earned": "$points_earned"}}
            }},
            {"$match": {"count": {"$gt": 1}}}
        ]
        
        duplicates = await views_collection.aggregate(pipeline).to_list(length=100)
        print(f"Found {len(duplicates)} sets of duplicate view records")
        
        # For each set of duplicates, keep the one with the highest watch_duration and points_earned
        for dup_set in duplicates:
            # Sort by watch_duration (descending) then by points_earned (descending)
            sorted_docs = sorted(
                dup_set["docs"], 
                key=lambda x: (x.get("watch_duration", 0), x.get("points_earned", 0)), 
                reverse=True
            )
            
            # Keep the first one (highest values)
            keep_id = sorted_docs[0]["_id"]
            
            # Delete the rest
            delete_ids = [doc["_id"] for doc in sorted_docs[1:]]
            if delete_ids:
                print(f"Keeping view record {keep_id}, deleting {len(delete_ids)} duplicates")
                result = await views_collection.delete_many({"_id": {"$in": delete_ids}})
                print(f"Deleted {result.deleted_count} duplicate records")
        
        # Now create the unique index
        await views_collection.create_index(
            [("video_id", 1), ("viewer_id", 1)], 
            unique=True,
            name="viewer_video_unique_idx"
        )
        print("Created unique view record index")
    except Exception as e:
        print(f"Error creating indexes: {e}")
        # Continue with application startup even if index creation fails
        # This prevents the app from crashing due to index issues


async def connect_and_init_db():
    try:
        # Verify connection is successful
        await client.admin.command('ping')
        print("Connected to MongoDB!")

        # Setup indexes
        await create_indexes()
        print("Database indexes created!")
        return True
    except Exception as e:
        print(f"Error connecting to database: {e}")
        # Don't raise the exception, so the app can still start
        # Index errors shouldn't prevent the application from running
        return False