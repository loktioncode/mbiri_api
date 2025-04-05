from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta, datetime
from typing import Any

from models.user import UserCreate, User, Token
from services.auth import authenticate_user, create_access_token, get_password_hash
from database import users_collection
from config import ACCESS_TOKEN_EXPIRE_MINUTES

router = APIRouter(prefix="/api/auth", tags=["authentication"])


@router.post("/register", response_model=User)
async def register_user(user_data: UserCreate) -> Any:
    # Check if user already exists
    existing_user = await users_collection.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Check username availability
    existing_username = await users_collection.find_one({"username": user_data.username})
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken"
        )

    # Create new user
    hashed_password = get_password_hash(user_data.password)
    user_in_db = {
        "email": user_data.email,
        "username": user_data.username,
        "hashed_password": hashed_password,
        "user_type": user_data.user_type,
        "points": 0,
        "created_at": datetime.utcnow()
    }

    result = await users_collection.insert_one(user_in_db)
    user_in_db["_id"] = str(result.inserted_id)  # Convert ObjectId to string

    return User(**user_in_db)


@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()) -> Any:
    user = await authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Create access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id), "type": user.user_type},
        expires_delta=access_token_expires
    )

    return Token(access_token=access_token, token_type="bearer")