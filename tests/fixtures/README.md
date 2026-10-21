# AVIF fixtures

These original 2×2 images were generated with Pillow. `red.avif` is a still
image; `red-blue.avif` contains red and blue frames lasting 100 and 200 ms.
The media tests use their actual container bytes while mocking browser decoding.

To regenerate:

```python
from PIL import Image

red = Image.new('RGB', (2, 2), 'red')
red.save('tests/fixtures/red.avif')
red.save('tests/fixtures/red-blue.avif', save_all=True,
         append_images=[Image.new('RGB', (2, 2), 'blue')],
         duration=[100, 200], loop=0)
```
