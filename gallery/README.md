# Gallery photos

How to add photos to the homepage slideshow:

1. Copy your image files into this `gallery/` folder (e.g. `gallery/show-1.jpg`).
   Keep file sizes reasonable (under ~500 KB each) so the site stays fast on
   mobile data. JPG or WebP work best for photos.
2. Open `index.html`, find `const GALLERY_IMAGES = [];` near the bottom of
   the file, and list the filenames there, for example:

   ```js
   const GALLERY_IMAGES = [
       'gallery/show-1.jpg',
       'gallery/show-2.jpg',
       'gallery/show-3.jpg',
   ];
   ```

3. Save and publish (push to `main`, GitHub Pages redeploys automatically).

The order in the list is the order they play in the slideshow. Leave the
array empty to keep showing the "coming soon" placeholder tiles.
