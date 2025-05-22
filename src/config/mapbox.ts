import mapbox from "@mapbox/mapbox-sdk"
import mbxGeocoding from "@mapbox/mapbox-sdk/services/geocoding"
import { env } from "./env"

const mapboxClient = mapbox({ accessToken: env.MAPBOX_ACCESS_TOKEN })
export const geocodingClient = mbxGeocoding(mapboxClient)
