export type DeviceLocation = { latitude: number; longitude: number; accuracy?: number };

function requestPosition(options: PositionOptions) {
  return new Promise<DeviceLocation | null>((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }),
      () => resolve(null),
      options,
    );
  });
}

/** Captures GPS when available, with a cached/low-accuracy fallback for PCs and indoors. */
export async function captureDeviceLocation() {
  const precise = await requestPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  if (precise) return precise;
  return requestPosition({ enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 });
}
