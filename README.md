# Mbiri API - Video Platform

A platform for creators to share videos and viewers to earn points by watching content.

## Features

### For Creators
- Upload and manage YouTube videos
- Set points per minute for videos
- Track video analytics and viewer engagement
- View earnings and performance metrics

### For Viewers
- Browse and discover videos
- Add videos to Watch Later list
- Earn points for watching videos
- Track points earned and watch history

## Tech Stack

### Frontend
- **Framework**: Next.js 14 with App Router
- **Styling**: Tailwind CSS
- **State Management**: React Query
- **Authentication**: Custom JWT-based auth
- **Video Player**: YouTube iframe embed
- **UI Components**: Heroicons

### Backend
- **Framework**: FastAPI
- **Database**: MongoDB
- **Authentication**: JWT
- **API Documentation**: Swagger UI

## Frontend Setup

1. Install dependencies:
```bash
cd frontend
npm install
```

2. Create `.env.local` file:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

3. Run development server:
```bash
npm run dev
```

## Frontend Features

### Video Discovery
- Responsive grid layout for video display
- Video cards with thumbnails, titles, and creator info
- Points per minute display for viewers
- Hover effects and play button overlay

### Video Page
- YouTube video player
- Video details (title, description, creator)
- Watch Later functionality for logged-in viewers
- Points earning information
- Responsive layout

### Watch Later
- Add/remove videos from watchlist
- Track watched status
- Calculate potential points earnings
- Empty state with call-to-action

### Authentication
- Login/Register pages
- Protected routes
- User type-specific features (creator/viewer)
- Persistent authentication state

## API Endpoints

### Videos
- `GET /api/videos/discover` - Get videos for discovery feed
- `GET /api/videos/{video_id}` - Get specific video
- `POST /api/videos/{video_id}/watch` - Record watch session (viewer only)

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

## Environment Variables

### Frontend
- `NEXT_PUBLIC_API_URL` - Backend API URL

### Backend
- `MONGODB_URL` - MongoDB connection string
- `JWT_SECRET` - JWT secret key
- `JWT_ALGORITHM` - JWT algorithm (default: HS256)

## Development

1. Start backend server:
```bash
uvicorn main:app --reload
```

2. Start frontend development server:
```bash
cd frontend
npm run dev
```

3. Access the application:
- Frontend: http://localhost:3000
- API Docs: http://localhost:8000/docs

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request 