import { getVisionWindow } from '../../src/shared/domain/fog';

describe('fog of war vision bands', () => {
  it('uses beta-friendly square visibility by level band', () => {
    expect(getVisionWindow(1)).toEqual({ radius: 2, size: 5 });
    expect(getVisionWindow(3)).toEqual({ radius: 2, size: 5 });
    expect(getVisionWindow(4)).toEqual({ radius: 3, size: 7 });
    expect(getVisionWindow(9)).toEqual({ radius: 3, size: 7 });
    expect(getVisionWindow(10)).toEqual({ radius: 4, size: 9 });
    expect(getVisionWindow(13)).toEqual({ radius: 4, size: 9 });
    expect(getVisionWindow(14)).toEqual({ radius: 5, size: 11 });
    expect(getVisionWindow(99)).toEqual({ radius: 5, size: 11 });
  });
});
