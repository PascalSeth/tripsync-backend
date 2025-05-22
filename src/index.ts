import express from "express"
import { createServer } from "http"
import { setupSocket } from "./config/socket"
import routes from "./api/routes"
import { clerkMiddleware } from "@clerk/express"
import { errorHandler } from "./api/middlewares/errorMiddleware"
import fileUpload from "express-fileupload"
import cors from "cors"

const app = express()
const httpServer = createServer(app)
const io = setupSocket(httpServer)

// Middleware
app.use(cors())
app.use(express.json())
app.use(
  fileUpload({
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max file size
    useTempFiles: true,
    tempFileDir: "/tmp/",
  }),
)
app.use(clerkMiddleware())

// Add socket.io to request object
app.use((req, res, next) => {
  ;(req as any).io = io
  next()
})

// Routes
app.use("/api", routes)

// Error handling
app.use(errorHandler)

const PORT = process.env.PORT || 3000
httpServer.listen(PORT, () => {
  console.log(`TripSync server running on port ${PORT}`)
})
