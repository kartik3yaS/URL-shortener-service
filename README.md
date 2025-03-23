# URL Shortener Service
- A robust, scalable URL shortening service built with Node.js, Express, PostgreSQL, and Redis.
  
## Brief Explanation of Approach
- This URL shortener service is designed with scalability:
### 1. Architecture
- Layered Design: Separation of concerns with routes, services, and data access layers
- Caching Strategy: Redis for high-performance URL lookups with database fallback
- Scalability: Node.js clustering for multi-core utilization
- Data Storage: PostgreSQL for persistent storage with proper indexing
### 2. Key Features
- Short Code Generation: Secure random codes with configurable length
- Custom Aliases: Support for user-defined short URLs
- URL Expiration: Automatic deactivation of expired links
- Click Tracking: Analytics for URL usage
- Security Measures: Rate limiting, input validation, and malicious URL detection
### 3. Technical Decisions
- Used static service classes to encapsulate business logic
- Implemented database connection pooling for better performance
- Added Redis caching to reduce database load
- Configured clustering to utilize all CPU cores
- Created periodic cleanup jobs to manage expired URLs
  
## Installation
### 1. Clone the repository:
```bash
git clone https://github.com/kartik3yaS/GIVA.git
```
### 2. Install dependencies:
```bash
npm install
```
### 3. Set up environment variables:
#### Create a `.env` file in the root directory with:
```bash
PORT=3000
POSTGRES_URI=postgresql://username:password@localhost:5432/url_shortner
REDIS_URI=redis://localhost:6379
BASE_URL=http://localhost:3000
NODE_ENV=development
ENABLE_CLUSTER=false
```
#### Replace username and password with your PostgreSQL credentials.
### 4. Set up the database:
- Create a PostgreSQL database named url_shortner
- The application will automatically create the necessary tables on startup
### 5. Start the server:
#### For development:
```bash
npm run dev
```
#### For production with clustering: (Ignore it for now)
```bash
NODE_ENV=production ENABLE_CLUSTER=true
npm start
```
### 6. Verify the installation:
- The server should display "URL Shortener service running on port 3000"
- You can check the health endpoint at http://localhost:3000/health
  
## Example API Requests & Responses
### Base url
```bash
http://localhost:3000
```
### 1. Shorten a URL
Request:
```bash
POST /shorten
Content-Type: application/json
{
  "longUrl": "https://www.example.com/very/long/path/that/needs/shortening"
}
```
Response:
```bash
{
  "success": true,
  "shortUrl": "http://localhost:3000/UXvqFkU",
  "shortCode": "UXvqFkU",
  "longUrl": "https://www.example.com/very/long/path/that/needs/shortening",
  "expiresIn": null,
  "customAlias": false
}
```
### 2. Shorten a URL with Expiration
Request:
```bash
POST /shorten
Content-Type: application/json

{
  "longUrl": "https://www.example.com/temporary-link",
  "expiresIn": 86400
}
```
Response:
```bash
{
  "success": true,
  "shortUrl": "http://localhost:3000/7YtR2Ws",
  "shortCode": "7YtR2Ws",
  "longUrl": "https://www.example.com/temporary-link",
  "expiresIn": 86400,
  "customAlias": false
}
```
### 3. Create URL with Custom Alias
Request:
```bash
POST /shorten?alias=mylink
Content-Type: application/json

{
  "longUrl": "https://www.example.com/my-special-page"
}
```
Response:
```bash
{
  "success": true,
  "shortUrl": "http://localhost:3000/mylink",
  "shortCode": "mylink",
  "longUrl": "https://www.example.com/my-special-page",
  "expiresIn": null,
  "customAlias": true
}
```
### 4. Access a Short URL
Request:
```bash
GET /UXvqFkU
```
Response:
```bash
HTTP 302 Found
Location: https://www.example.com/very/long/path/that/needs/shortening
```
### 5. Get URL Statistics
Request:
```bash
GET /stats/UXvqFkU
```
Response:
```bash
{
  "success": true,
  "stats": {
    "shortCode": "UXvqFkU",
    "longUrl": "https://www.example.com/very/long/path/that/needs/shortening",
    "clicks": 5,
    "createdAt": "2023-03-25T12:00:00Z",
    "expiresAt": null,
    "lastAccessed": "2023-03-25T15:30:00Z",
    "isCustomAlias": false
  }
}
```

## Redis Configuration
- Redis provides caching capabilities that significantly improve performance by reducing database load.
### 1. Install Redis:
- On Ubuntu/Debian:
```bash
sudo apt update
sudo apt install redis-server
```
- On macOS:
```bash
brew install redis
```
- On Windows, download from Redis website
### 2. Configure Redis Connection:
In your `.env` file:
```bash
REDIS_URI=redis://localhost:6379
```
### 3. Verify Redis Connection:
When the application starts, you should see:
```bash
Redis client connected
```

## Enabling Clustering for Scalability
Node.js clustering allows the application to utilize all CPU cores, significantly improving performance under high load.
### 1. Update Environment Variables:
In your `.env` file:
```bash
NODE_ENV=production
ENABLE_CLUSTER=true
```
### 2. Start the Application:
```bash
npm start
```
### 3. Verify Clustering:
You should see output similar to:
```bash
Master 12345 is running
Worker 12346: URL Shortener service running on port 3000
Worker 12347: URL Shortener service running on port 3000
...
```
