Logos shown on the login page. The file names are listed in
src/features/auth/pages/LoginPage/LoginPage.tsx (GROUP_LOGO and DEALERSHIPS):

  Ittehadmotors-logo.png        -> main logo at the top
  Hyundai-logo.png              -> Hyundai Islamabad
  jetour-ittehad-logo.png       -> Jetour Ittehad (also on its quotation, PPF voucher and delivery note)
  CSM-Logo.png                  -> CSM Ittehad

To replace a logo, overwrite the file with the same name. If you use a different name,
update it in LoginPage.tsx too; its `crop` value trims empty space around the artwork.
Transparent PNGs work best; white backgrounds are also blended away on the page.
