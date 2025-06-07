//socket.ts
import { Server } from "socket.io"
import { prisma } from "./prisma"

export const setupSocket = (httpServer: any) => {
  const io = new Server(httpServer, {
    cors: { origin: "*" },
  })

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id)

    socket.on("driver:update_location", async ({ driverId, latitude, longitude }) => {
      const location = await prisma.location.upsert({
        where: { id: (await prisma.driverProfile.findUnique({ where: { id: driverId } }))?.currentLocationId || "" },
        update: { latitude, longitude },
        create: { latitude, longitude, address: "Driver Location", city: "", country: "" },
      })

      await prisma.driverProfile.update({
        where: { id: driverId },
        data: { currentLocationId: location.id },
      })

      io.to(`service:${driverId}`).emit("service:location_update", { driverId, latitude, longitude })
    })

    socket.on("service:join", ({ serviceId }) => {
      socket.join(`service:${serviceId}`)
    })

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id)
    })
  })

  return io
}
