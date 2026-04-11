import { getVisionWindow } from '@/shared/domain/fog';

describe('fog progression', () => {
  it('starts at 3x3', () => {
    expect(getVisionWindow(1)).toEqual({ radius: 1, size: 3 });
  });

  it('expands every two levels and caps at 21x21', () => {
    expect(getVisionWindow(5)).toEqual({ radius: 3, size: 7 });
    expect(getVisionWindow(25)).toEqual({ radius: 10, size: 21 });
  });
});
