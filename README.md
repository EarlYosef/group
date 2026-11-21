# SAC Campus Navigator 3D

Campus map for St. Anthony's College, San Jose, Antique. Type a room (for example `D112`) and get
step-by-step directions on a 3D map. On a phone, the AR guide shows the way through the camera.

Live site: https://group-9iy0.onrender.com (Render static site, publish directory `campus-map`).

## Files

| File | What it does | Change it when... |
| --- | --- | --- |
| `index.html` | Page layout and all buttons | you add a button or text |
| `style.css` | Colors, fonts, layout, dark mode | you change the look (colors are in section 1) |
| `data.js` | Rooms, buildings, paths, plan position, settings | you add or fix a room or building |
| `graph.js` | BFS and DFS route finding | you change the algorithms |
| `plan.js` | Converts plan pixels to GPS and back | the plan is misaligned |
| `plan-image.js` | The campus plan picture (as text) | you replace the plan image |
| `map3d.js` | The 3D map, layers, markers, camera | you change how the map looks |
| `ar.js` | AR camera guide, compass, mini map | you change the AR guide |
| `zone.js` | "Where am I" card and Main Gate circle | you change the location messages |
| `app.js` | Connects everything together | you add a feature that links the parts |

Scripts load in the order shown at the bottom of `index.html`. Keep that order.

## Colors

SAC maroon and yellow. Edit `--maroon`, `--maroon-deep` and `--gold` at the top of `style.css`.
Map paper colors are `MAP_BACKGROUND` and `MAP_BACKGROUND_DARK` in `data.js`.

## Update the live site

```
git add .
git commit -m "describe what you changed"
git push
```

Render redeploys by itself in about a minute.

## Notes

- Camera, compass and location only work over HTTPS (the Render link is fine).
- GPS is weak indoors. The AR guide has a tap fallback after 20 seconds without a good signal.