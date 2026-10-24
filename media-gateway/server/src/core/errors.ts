export class DeviceNotFound extends Error {
  override readonly name = 'DeviceNotFound';
  constructor(readonly deviceId: string) {
    super('Device not found');
  }
}

/** The media source could not be reached or answered unexpectedly. */
export class SourceUnavailable extends Error {
  override readonly name = 'SourceUnavailable';
  constructor(options?: ErrorOptions) {
    super('Media source unavailable', options);
  }
}

export class LiveCallFailed extends Error {
  override readonly name = 'LiveCallFailed';
  constructor(
    readonly deviceId: string,
    options?: ErrorOptions,
  ) {
    super('Live video unavailable', options);
  }
}
