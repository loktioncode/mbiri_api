from fastapi import APIRouter, Depends, HTTPException, status
from typing import Any, Dict, List

from models.user import User, UserInDB, UserUpdate
from services.auth import get_current_user, get_password_hash
from services.points import get_user_points, transfer_points
from database import users_collection
from bson import ObjectId

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/me", response_model=User)
async def get_current_user_info(current_user: UserInDB = Depends(get_current_user)) -> Any:
    """
    Get current user information
    """
    return current_user


@router.put("/me", response_model=User)
async def update_user_info(
        update_data: UserUpdate,
        current_user: UserInDB = Depends(get_current_user)
) -> Any:
    """
    Update current user information
    """
    # Create update data dictionary
    update_dict = update_data.dict(exclude_unset=True)

    # Hash password if provided
    if "password" in update_dict:
        update_dict["hashed_password"] = get_password_hash(update_dict.pop("password"))

    # Update user
    if update_dict:
        await users_collection.update_one(
            {"_id": ObjectId(current_user.id)},
            {"$set": update_dict}
        )

    # Get updated user
    updated_user = await users_collection.find_one({"_id": ObjectId(current_user.id)})
    return User(**updated_user)


@router.get("/me/points")
async def get_my_points(current_user: UserInDB = Depends(get_current_user)) -> Dict[str, Any]:
    """
    Get points information for current user
    """
    return await get_user_points(str(current_user.id))


@router.post("/transfer-points")
async def transfer_user_points(
        recipient_id: str,
        points: int,
        current_user: UserInDB = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Transfer points from current user to another user
    """
    if current_user.user_type != "creator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only creators can transfer points"
        )

    if points <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Points must be greater than zero"
        )

    result = await transfer_points(str(current_user.id), points, recipient_id)

    return {
        "success": result,
        "message": f"Successfully transferred {points} points"
    }


@router.get("/{user_id}", response_model=User)
async def get_user_by_id(user_id: str) -> Any:
    """
    Get information about a specific user
    """
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return User(**user)