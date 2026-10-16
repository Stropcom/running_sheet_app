import { describe, it, expect } from "vitest";
import {
  PERTH_FALLBACK,
  USABLE_FIX_ACCURACY_M,
  acceptFix,
  chooseBiasCentre,
  isUsableFix,
} from "../shared/addressBias";

const PHONE = { lat: -31.9, lng: 115.95, accuracy: 25 };
const LAPTOP_WIFI = { lat: -32.05, lng: 115.75, accuracy: 120 };
const LAPTOP_IP = { lat: -33.87, lng: 151.21, accuracy: 25000 };

describe("isUsableFix", () => {
  it("trusts GPS and Wi-Fi accuracy, not an internet-address guess", () => {
    expect(isUsableFix(PHONE)).toBe(true);
    expect(isUsableFix(LAPTOP_WIFI)).toBe(true);
    expect(isUsableFix({ ...PHONE, accuracy: USABLE_FIX_ACCURACY_M })).toBe(
      true
    );
    expect(isUsableFix({ ...PHONE, accuracy: USABLE_FIX_ACCURACY_M + 1 })).toBe(
      false
    );
    expect(isUsableFix(LAPTOP_IP)).toBe(false);
  });
  it("rejects a fix with no accuracy, nonsense coordinates or nothing", () => {
    expect(isUsableFix({ lat: -31.9, lng: 115.9 })).toBe(false);
    expect(isUsableFix({ lat: -31.9, lng: 115.9, accuracy: null })).toBe(false);
    expect(isUsableFix({ lat: NaN, lng: 115.9, accuracy: 10 })).toBe(false);
    expect(isUsableFix({ lat: 95, lng: 115.9, accuracy: 10 })).toBe(false);
    expect(isUsableFix(null)).toBe(false);
    expect(isUsableFix(undefined)).toBe(false);
  });
});

describe("acceptFix", () => {
  it("follows the device: each good fix replaces the last", () => {
    const first = acceptFix(null, PHONE);
    expect(first).toEqual({ lat: PHONE.lat, lng: PHONE.lng });
    expect(acceptFix(first, LAPTOP_WIFI)).toEqual({
      lat: LAPTOP_WIFI.lat,
      lng: LAPTOP_WIFI.lng,
    });
  });
  it("never lets a poor reading discard a good one", () => {
    const good = acceptFix(null, PHONE);
    expect(acceptFix(good, LAPTOP_IP)).toBe(good);
    expect(acceptFix(null, LAPTOP_IP)).toBeNull();
  });
  it("keeps only latitude and longitude", () => {
    expect(Object.keys(acceptFix(null, PHONE)!).sort()).toEqual(["lat", "lng"]);
  });
});

describe("chooseBiasCentre", () => {
  it("prefers the last good position, then the fallback, then Perth", () => {
    const here = { lat: -31.9, lng: 115.95 };
    const op = { lat: -33.3, lng: 115.6 };
    expect(chooseBiasCentre(here, op)).toBe(here);
    expect(chooseBiasCentre(null, op)).toBe(op);
    expect(chooseBiasCentre(null)).toBe(PERTH_FALLBACK);
    expect(chooseBiasCentre(null, null)).toBe(PERTH_FALLBACK);
  });
  it("a laptop on an internet-address guess ends up on Perth, not Sydney", () => {
    expect(chooseBiasCentre(acceptFix(null, LAPTOP_IP))).toBe(PERTH_FALLBACK);
  });
});
