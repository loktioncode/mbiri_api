# Creator-Viewer Platform API

A FastAPI-based backend for a platform connecting content creators with viewers. This API handles user authentication, video management, and analytics.

## Prerequisites

- Python 3.8 or higher
- MongoDB database
- Virtual environment (recommended)

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd mbiri_api
```

2. Create and activate a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows, use: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Create a `.env` file in the root directory with the following variables:
```env
MONGODB_URL=your_mongodb_connection_string
DATABASE_NAME=your_database_name
SECRET_KEY=your_jwt_secret_key
```

### Environment Variables

- `MONGODB_URL`: MongoDB connection string (default: development MongoDB URL)
- `DATABASE_NAME`: Name of the MongoDB database (default: "creator_viewer_app")
- `SECRET_KEY`: Secret key for JWT token generation (default: development key)

## Running the Application

1. Start the FastAPI server:
```bash
uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`

2. Access the API documentation:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## API Features

- User Authentication (Register, Login)
- User Management
- Video Management
- Analytics and Points System

## Development

The application uses:
- FastAPI for the web framework
- Motor for async MongoDB operations
- JWT for authentication
- Pydantic for data validation

## Project Structure

```
mbiri_api/
├── main.py              # Application entry point
├── config.py            # Configuration settings
├── database.py          # Database connection and setup
├── models/              # Pydantic models
├── routers/             # API route handlers
├── services/            # Business logic
└── requirements.txt     # Project dependencies
```

## Security Notes

- Always use a strong `SECRET_KEY` in production
- Never commit `.env` file to version control
- Use environment-specific MongoDB URLs
- Implement proper CORS settings for production 