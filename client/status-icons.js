/**
 * Status icons (#63) -- replaces the previous Streamline Flex set with a
 * new pictorial set (some Icons8-sourced -- see #190 for the attribution
 * this app owes them, tracked on the help/legal pages issue).
 *
 * flash/send/project/abandoned were later hand-tweaked by Raven for a
 * cohesive diagonal angle across the set (all four now lean the same
 * way as the ruby project icon) -- reapplied this file's own color
 * choices on top of each reshaped SVG rather than the shapes carrying
 * their own colors.
 *
 * flash: Icons8's bolt, recolored to this app's existing amber-gold
 * (#f4b400/#b8860b, the same two fills the old flash icon used -- the
 * source SVG's own colors didn't match the app). Originally two
 * illustrative overlapping shapes (a shading detail on the second path,
 * not an outline); restructured to a single shape duplicated with fill+
 * stroke (stroke-width 5) for an outward border, matching send's own
 * border technique, once the two icons' angles converged and a visual
 * "match the stroke width to send" request no longer had anything to
 * apply to on the original two-shape construction.
 * send: not Icons8 -- a custom two-tone checkmark, green fill matching
 * the original send.svg's own background color (#26d93b), lighter green
 * outline (#24923f, tuned down from an earlier, more contrasty
 * #0a4a1c/#1a6b2e) sitting entirely outside the fill (not straddling it,
 * unlike a plain SVG stroke).
 * project: the ruby option from #63's two choices (not fire), lines
 * later simplified -- same colors throughout, ruby was never recolored.
 * wishlist: Icons8's eye icon, unmodified.
 * abandoned: not Icons8 -- a folder icon, recolored violet (#8b5cf6
 * body / #5b21b6 tab) after comparing red (too close to the ruby project
 * icon), lilac, and indigo. Reshaped so the body ("front") sits shorter,
 * letting the tab ("back") show across the whole top edge.
 *
 * wishlist/abandoned kept their original keys here when this file was
 * first written -- the "Checkout"/"Archive" rename mentioned in #63's
 * original body was a separate, bigger decision (touches label copy
 * across the app, not just the icon), not part of that pass. Done now,
 * as checkout/archived (#483) -- the STATUS_ICONS keys below, same eye/
 * folder artwork, no new icons (that half of #63's original mockups was
 * never adopted either).
 *
 * Used by logbook/index.html (list badges, stats bar, and the entry form).
 */

export const STATUS_ICONS = {
  flash: `<svg width="14" height="14" viewBox="0 0 65 100" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2;">
    <g transform="matrix(1,0,0,1,-17.61265,-0)">
        <g transform="matrix(1,0,0,1,19.997168,4.002098)">
            <g transform="matrix(1.195005,0,0,1.158261,-5.850764,-7.279803)">
                <path d="M41.5,38.034C55.531,38.034 55.66,37.91 56.443,38.569C57.988,39.869 56.369,42.031 56.191,42.268C55.051,43.791 53.943,44.816 49.097,51.177C47.691,53.023 44.216,57.211 43.785,57.73C43.589,57.966 29.349,75.818 27.777,77.722C24.947,81.149 19.427,88.615 18.285,89.027C17.064,89.467 14.979,88.998 15.903,85.608C16.015,85.196 25.097,55.473 25.096,55.462C25.013,54.255 24.789,54.229 23.595,54.045C22.782,53.92 5.892,54.268 4.398,53.83C3.417,53.543 1.918,52.216 3.805,49.731C4.797,48.425 14.828,36.191 18.911,30.833C19.778,29.695 23.814,24.815 24.244,24.295C28.388,19.284 40.557,3.431 41.731,2.97C42.361,2.722 44.765,2.455 44.367,5.478C44.167,6.991 35.686,35.944 35.678,36.513C35.676,36.627 35.664,37.503 36.327,37.783C36.698,37.939 36.702,37.869 41.5,38.034Z" style="fill:#b8860b;stroke:#b8860b;stroke-width:5;stroke-linejoin:round;"/>
                <path d="M41.5,38.034C55.531,38.034 55.66,37.91 56.443,38.569C57.988,39.869 56.369,42.031 56.191,42.268C55.051,43.791 53.943,44.816 49.097,51.177C47.691,53.023 44.216,57.211 43.785,57.73C43.589,57.966 29.349,75.818 27.777,77.722C24.947,81.149 19.427,88.615 18.285,89.027C17.064,89.467 14.979,88.998 15.903,85.608C16.015,85.196 25.097,55.473 25.096,55.462C25.013,54.255 24.789,54.229 23.595,54.045C22.782,53.92 5.892,54.268 4.398,53.83C3.417,53.543 1.918,52.216 3.805,49.731C4.797,48.425 14.828,36.191 18.911,30.833C19.778,29.695 23.814,24.815 24.244,24.295C28.388,19.284 40.557,3.431 41.731,2.97C42.361,2.722 44.765,2.455 44.367,5.478C44.167,6.991 35.686,35.944 35.678,36.513C35.676,36.627 35.664,37.503 36.327,37.783C36.698,37.939 36.702,37.869 41.5,38.034Z" style="fill:#f4b400;"/>
            </g>
        </g>
    </g>
  </svg>`,

  send: `<svg width="14" height="14" viewBox="0 0 191 191" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2;">
    <g transform="matrix(1,0,0,1,-2.078254,0.226197)">
        <g transform="matrix(2.6,0,0,2.6,-30,-30)">
            <g transform="matrix(1.275565,-0.141258,0.145283,1.311915,-7.95315,4.582837)">
                <path d="M33.982,42.322L60.236,17.679L65.677,30.039L33.459,59.69L16.263,42.667L26.209,34.164L33.982,42.322Z" style="fill:#26d93b;"/>
                <path d="M34.269,37.479L61.204,11.826L69.633,31.414L33.363,64.793L11.044,42.7L26.166,28.683L34.269,37.479ZM33.982,42.322L26.209,34.164L16.263,42.667L33.459,59.69L65.677,30.039L60.236,17.679L33.982,42.322Z" style="fill:#24923f;"/>
            </g>
        </g>
    </g>
  </svg>`,

  project: `<svg width="14" height="14" viewBox="0 0 100 100" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2;">
    <g id="Background" transform="matrix(0.707616,0.706597,-0.706597,0.707616,49.959271,-14.535333)">
        <path d="M52.557,20.38C52.557,20.38 76.098,74.44 76.159,74.5C76.868,75.201 77.114,74.817 77.819,75.515C77.726,75.862 77.845,76.244 77.752,76.591C77.718,76.718 77.51,77.495 76.541,77.687C76.197,77.754 75.834,77.615 75.491,77.683C75.036,77.276 75.05,76.467 74.595,76.06C74.339,75.831 20.74,52.056 20.74,52.056L52.557,20.38Z" style="fill:rgb(215,27,37);"/>
        <path d="M70.59,2.278C71.012,2.73 71.633,2.417 71.815,4.467C72.084,7.495 77.757,74.635 77.819,75.515C77.114,74.817 76.868,75.201 76.159,74.5C76.098,74.44 53.182,22.371 52.557,20.38C55.401,18.384 55.197,18.167 57.682,15.682C66.781,6.584 67.364,6.055 68.244,5.257C68.96,4.607 68.893,4.56 70.59,2.278Z" style="fill:rgb(254,63,83);"/>
        <path d="M20.677,52.019C20.677,52.019 74.339,75.831 74.595,76.06C75.05,76.467 75.036,77.276 75.491,77.683C67.542,76.75 5.194,72.193 3.453,71.621C3.202,71.538 3.009,71.323 2.759,71.24C3.157,70.771 2.99,70.645 4.5,69.193C5.629,68.107 6.066,67.686 18.38,55.38C19.832,53.928 19.688,53.829 20.677,52.019Z" style="fill:rgb(136,14,28);"/>
        <g transform="matrix(0.707616,-0.706597,0.706597,0.707616,-25.081364,45.586518)">
            <path d="M53.462,13.728L53.462,15.811C53.462,15.811 65.398,29.599 68.611,33.134C69.658,34.285 72.743,37.019 72.743,37.019L27.817,36.955C27.817,36.955 30.533,34.62 31.216,33.833C34.348,30.226 47.114,15.836 47.114,15.836L47.115,13.728L53.462,13.728Z" style="fill:rgb(254,63,68);"/>
        </g>
        <path d="M2.354,38.481L20.677,52.019C20.677,52.019 21.275,52.429 18.38,55.38C6.188,67.806 5.629,68.107 4.5,69.193C2.99,70.645 3.157,70.771 2.759,71.24C2.712,71.079 2.308,70.698 2.26,69.521C2.155,66.96 2.31,39.991 2.354,38.481Z" style="fill:rgb(172,20,38);"/>
        <path d="M39.039,2.039C43.06,1.917 64.299,2.031 70.59,2.278C68.893,4.56 68.96,4.607 68.244,5.257C67.364,6.055 64.321,9.148 55.222,18.246C52.737,20.731 52.557,20.38 52.557,20.38C52.557,20.38 39.942,3.751 39.039,2.039Z" style="fill:rgb(255,127,138);"/>
        <path d="M17.958,22.009L19.447,23.502C19.447,23.502 20.415,38.953 20.914,47.47C21.047,49.758 20.817,50.69 20.715,52.081C17.43,50.151 2.354,38.481 2.354,38.481C2.403,38.352 2.96,36.872 2.96,36.872C3.263,36.539 17.958,22.009 17.958,22.009Z" style="fill:rgb(215,26,51);"/>
        <g transform="matrix(-0.001441,0.999999,0.999999,0.001441,0.561195,-0.370245)">
            <path d="M17.863,21.914L19.335,23.388C19.335,23.388 20.507,37.826 20.856,46.35C20.952,48.715 20.827,49.721 20.677,52.019C17.825,50.348 2.354,38.481 2.354,38.481C2.403,38.352 2.96,36.872 2.96,36.872C3.263,36.539 17.863,21.914 17.863,21.914Z" style="fill:rgb(215,26,51);"/>
        </g>
    </g>
  </svg>`,

  checkout: `<svg width="14" height="14" viewBox="0 0 100 100" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2;">
    <path d="M46.561,73.054C45.555,72.856 34.223,71.466 28.693,59.412C25.474,52.394 25.877,42.028 32.567,34.56C41.013,25.131 52.161,26.495 55.539,27.35C71.749,31.457 77.252,49.616 70.312,61.394C61.853,75.75 46.904,73.075 46.561,73.054ZM49.477,40.089C47.325,40.41 47.231,40.129 45.364,41.238C34.359,47.778 42.293,62.434 52.529,59.603C62.296,56.901 62.241,43.059 52.531,40.39C51.033,39.979 51.024,40.157 49.477,40.089Z" style="fill:white;"/>
    <g id="Background" transform="matrix(1,0,0,1,0,14)">
        <path d="M100,35.269L100,36.757C100,36.757 98.362,39.723 97.737,40.65C97.023,41.711 97.019,41.705 96.958,41.798C96.052,43.174 91.007,50.845 83.209,57.135C80.782,59.093 76.314,61.988 76.225,62.039C73.052,63.849 51.092,77.012 25.323,62.834C9.037,53.874 0,36.727 0,36.727L0,35.268C0,35.268 2.235,31.176 7.313,25.342C32.429,-3.518 64.782,-5.687 91.753,24.278C96.642,29.709 100,35.269 100,35.269ZM46.561,59.054C45.555,58.856 34.223,57.466 28.693,45.412C25.474,38.394 25.877,28.028 32.567,20.56C41.013,11.131 52.161,12.495 55.539,13.35C71.749,17.457 77.252,35.616 70.312,47.394C61.853,61.75 46.904,59.075 46.561,59.054Z" style="fill:rgb(242,175,13);fill-opacity:1;"/>
        <path d="M49.477,26.089C51.024,26.157 51.033,25.979 52.531,26.39C62.241,29.059 62.296,42.901 52.529,45.603C42.293,48.434 34.359,33.778 45.364,27.238C47.231,26.129 47.325,26.41 49.477,26.089Z" style="fill:rgb(242,175,13);"/>
    </g>
  </svg>`,

  archived: `<svg width="14" height="14" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <path fill="#5b21b6" d="M40,12L22,12L18,8L8,8C5.8,8 4,9.8 4,12L4,20L44,20L44,16C44,13.8 42.2,12 40,12Z"/>
    <g transform="matrix(1,0,0,0.928571,0,2.857143)">
      <path fill="#8b5cf6" d="M40,12L8,12C5.8,12 4,13.8 4,16L4,36C4,38.2 5.8,40 8,40L40,40C42.2,40 44,38.2 44,36L44,16C44,13.8 42.2,12 40,12Z"/>
    </g>
  </svg>`,
};
