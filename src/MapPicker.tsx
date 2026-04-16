import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const ZIMBABWE_BOUNDS: L.LatLngBoundsExpression = [[-23, 25], [-15, 34]]

type Props = {
  lat: number
  lon: number
  onSelect: (lat: number, lon: number) => void
  height?: string
}

export default function MapPicker({ lat, lon, onSelect, height = '400px' }: Props) {
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const map = L.map(containerRef.current).setView([lat, lon], 6)
    map.setMaxBounds(ZIMBABWE_BOUNDS)
    map.setMinZoom(5)
    map.setMaxZoom(14)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map)

    const icon = L.divIcon({
      className: 'map-marker-icon',
      html: '<div style="background:#059669;width:24px;height:24px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    })

    const marker = L.marker([lat, lon], { icon, draggable: true }).addTo(map)
    markerRef.current = marker

    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat: l, lng: ln } = e.latlng
      marker.setLatLng([l, ln])
      onSelect(l, ln)
    })

    marker.on('dragend', () => {
      const pos = marker.getLatLng()
      onSelect(pos.lat, pos.lng)
    })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (markerRef.current && mapRef.current) {
      markerRef.current.setLatLng([lat, lon])
    }
  }, [lat, lon])

  return (
    <div
      ref={containerRef}
      style={{ height, borderRadius: '12px', overflow: 'hidden', zIndex: 0 }}
    />
  )
}
