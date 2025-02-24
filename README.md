# Poker Battle Application

A real-time multiplayer poker game application built with NestJS, React, and MySQL.

## Project Structure
- `/server` - NestJS backend application
- `/client` - React frontend application

## Tech Stack
- Backend: NestJS, TypeScript, MySQL
- Frontend: React, Redux, TypeScript
- Database: MySQL

## Prerequisites
- Node.js (v16 or higher)
- MySQL (v8.0 or higher)
- npm or yarn

## Getting Started

### Backend Setup
1. Navigate to the server directory:
```bash
cd server
npm install
npm run start:dev
```

### Frontend Setup
1. Navigate to the client directory:
```bash
cd client
npm install
npm start
```

### Environment Setup
1. Create `.env` files in both server and client directories based on the provided `.env.example` files
2. Configure your MySQL connection settings in the server's `.env` file

## Features
- Real-time multiplayer poker gameplay
- Support for up to 9 players per table
- User authentication and authorization
- Game state management
- Real-time chat and player interactions
