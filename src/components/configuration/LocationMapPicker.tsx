import type { MouseEventHandler } from 'react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';

interface LocationMapPickerProps {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  onChange: (coords: { lat: number; lng: number }) => void;
}

const TILE_SIZE = 256;
const ZOOM = 15;
const GRID = [-1, 0, 1];

function lngToTileX(lng: number, zoom: number) {
  return ((lng + 180) / 360) * 2 ** zoom;
}

function latToTileY(lat: number, zoom: number) {
  const latRad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** zoom;
}

function tileXToLng(x: number, zoom: number) {
  return (x / 2 ** zoom) * 360 - 180;
}

function tileYToLat(y: number, zoom: number) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** zoom;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export function LocationMapPicker({ latitude, longitude, radiusMeters, onChange }: LocationMapPickerProps) {
  const mapModel = useMemo(() => {
    const tileX = lngToTileX(longitude, ZOOM);
    const tileY = latToTileY(latitude, ZOOM);

    const centerTileX = Math.floor(tileX);
    const centerTileY = Math.floor(tileY);

    const offsetX = (tileX - centerTileX) * TILE_SIZE;
    const offsetY = (tileY - centerTileY) * TILE_SIZE;

    return { tileX, tileY, centerTileX, centerTileY, offsetX, offsetY };
  }, [latitude, longitude]);

  const handleClick: MouseEventHandler<HTMLDivElement> = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    const worldX = mapModel.tileX * TILE_SIZE + (clickX - rect.width / 2);
    const worldY = mapModel.tileY * TILE_SIZE + (clickY - rect.height / 2);

    const nextTileX = worldX / TILE_SIZE;
    const nextTileY = worldY / TILE_SIZE;

    onChange({ lat: tileYToLat(nextTileY, ZOOM), lng: tileXToLng(nextTileX, ZOOM) });
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((result) => {
      onChange({ lat: result.coords.latitude, lng: result.coords.longitude });
    });
  };

  return (
    <div className="space-y-2">
      <div className="relative h-72 w-full overflow-hidden rounded-lg border bg-slate-100 cursor-crosshair" onClick={handleClick}>
        {GRID.map((x) =>
          GRID.map((y) => {
            const tileX = mapModel.centerTileX + x;
            const tileY = mapModel.centerTileY + y;
            const left = (x + 1) * TILE_SIZE - mapModel.offsetX;
            const top = (y + 1) * TILE_SIZE - mapModel.offsetY;

            return (
              <img
                key={`${tileX}-${tileY}`}
                src={`https://tile.openstreetmap.org/${ZOOM}/${tileX}/${tileY}.png`}
                alt="Mapa"
                className="absolute h-64 w-64 max-w-none select-none"
                draggable={false}
                style={{ left, top }}
              />
            );
          })
        )}
        <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow" />
        <div className="absolute bottom-2 left-2 rounded bg-background/90 px-2 py-1 text-[11px] text-muted-foreground shadow">
          Radio: {Math.max(20, radiusMeters)}m
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Haz clic sobre el mapa para definir el centro de la ubicación.</p>
        <Button type="button" variant="outline" size="sm" onClick={useCurrentLocation}>Usar mi ubicación</Button>
      </div>
    </div>
  );
}
