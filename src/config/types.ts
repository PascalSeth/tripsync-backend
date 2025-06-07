//types.ts
declare global {
  namespace Express {
    interface Request {
      user?: { userId: string }
    }
  }
}

// This empty export makes the file a module
export {}