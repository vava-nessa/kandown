/**
 * @file Unit tests for the update-check version comparison
 * @description `semverGt` decides whether the npm registry is offering a newer
 * kandown than the one running, which in turn decides whether the CLI nags the
 * user and whether a live daemon self-upgrades. Getting it wrong is either an
 * update nobody ever sees or an upgrade loop, so the numeric, prerelease and
 * malformed-input branches are all pinned here.
 *
 * It returns a three-way comparison (1 / -1 / 0) despite the "Gt" name; the
 * tests document that, since a caller writing `if (semverGt(a, b))` would treat
 * -1 as "newer".
 */
import { describe, it, expect } from 'vitest';
import { semverGt } from '../updater';

describe('semverGt', () => {
  it('returns 0 for identical versions', () => {
    expect(semverGt('1.2.3', '1.2.3')).toBe(0);
  });

  it('compares major, then minor, then patch', () => {
    expect(semverGt('2.0.0', '1.9.9')).toBe(1);
    expect(semverGt('1.9.9', '2.0.0')).toBe(-1);
    expect(semverGt('1.3.0', '1.2.9')).toBe(1);
    expect(semverGt('1.2.4', '1.2.3')).toBe(1);
    expect(semverGt('1.2.3', '1.2.4')).toBe(-1);
  });

  it('compares numerically, not as strings (0.54.0 > 0.9.0)', () => {
    expect(semverGt('0.54.0', '0.9.0')).toBe(1);
    expect(semverGt('0.9.0', '0.54.0')).toBe(-1);
  });

  it('tolerates a leading v on either side', () => {
    expect(semverGt('v1.2.4', '1.2.3')).toBe(1);
    expect(semverGt('1.2.3', 'v1.2.3')).toBe(0);
  });

  it('treats a missing segment as 0 (1.2 === 1.2.0)', () => {
    expect(semverGt('1.2', '1.2.0')).toBe(0);
    expect(semverGt('1.2', '1.2.1')).toBe(-1);
  });

  it('ranks a release above a prerelease of the same version', () => {
    expect(semverGt('1.2.3', '1.2.3-beta.1')).toBe(1);
    expect(semverGt('1.2.3-beta.1', '1.2.3')).toBe(-1);
  });

  it('treats two prereleases of the same version as equal (no rc ordering)', () => {
    expect(semverGt('1.2.3-rc.1', '1.2.3-rc.2')).toBe(0);
  });

  it('still lets the numeric part win over a prerelease tag', () => {
    expect(semverGt('1.3.0-rc.1', '1.2.9')).toBe(1);
  });

  it('degrades a non-numeric segment to 0 instead of producing NaN', () => {
    expect(semverGt('1.x.3', '1.0.3')).toBe(0);
    expect(semverGt('', '0.0.0')).toBe(0);
  });
});
