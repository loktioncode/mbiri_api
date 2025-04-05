from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from bson import ObjectId

from models.user import UserInDB, TokenData
from database import users_collection
from config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")


# Password utilities
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    return pwd_context.hash(password)


# User authentication
async def get_user_by_email(email: str):
    user = await users_collection.find_one({"email": email})
    if user:
        # Convert ObjectId to string
        user["_id"] = str(user["_id"])
        return UserInDB(**user)
    return None


async def authenticate_user(email: str, password: str):
    user = await get_user_by_email(email)
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user


# JWT token handling
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        user_type: str = payload.get("type")

        if user_id is None:
            raise credentials_exception

        token_data = TokenData(user_id=user_id, user_type=user_type)
    except JWTError:
        raise credentials_exception

    user = await users_collection.find_one({"_id": ObjectId(token_data.user_id)})
    if user is None:
        raise credentials_exception

    # Convert ObjectId to string
    user["_id"] = str(user["_id"])
    return UserInDB(**user)


# Role-based access control
def get_creator(current_user: UserInDB = Depends(get_current_user)):
    if current_user.user_type != "creator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized. Creator access required."
        )
    return current_user


def get_viewer(current_user: UserInDB = Depends(get_current_user)):
    if current_user.user_type != "viewer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized. Viewer access required."
        )
    return current_user