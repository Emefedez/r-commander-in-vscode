// Tests run R for real, and some commands draw rgl or X11 windows. Make every R process started from a test headless
// (rgl uses its null device and there is no display), so a test can never open a window on the user's desktop.
process.env.RGL_USE_NULL = 'TRUE';
delete process.env.DISPLAY;
delete process.env.WAYLAND_DISPLAY;
