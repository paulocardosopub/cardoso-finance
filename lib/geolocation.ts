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

function requestWatchedPosition() {
  return new Promise<DeviceLocation | null>((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    let settled = false;
    let watchId: number | undefined;
    let timer: number | undefined;
    const finish = (location: DeviceLocation | null) => {
      if (settled) return;
      settled = true;
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      if (timer !== undefined) window.clearTimeout(timer);
      resolve(location);
    };
    timer = window.setTimeout(() => finish(null), 15000);
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) finish({ latitude, longitude, accuracy });
      },
      () => finish(null),
      { enableHighAccuracy: false, maximumAge: 10 * 60 * 1000 },
    );
  });
}

/** Captures GPS when available, with cached and watched fallbacks for PCs and indoors. */
export async function captureDeviceLocation() {
  const precise = await requestPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  if (precise) return precise;
  const cached = await requestPosition({ enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 });
  return cached ?? requestWatchedPosition();
}
