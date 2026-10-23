export const SAMPLE_RECIPE = `v1
# Motiflow sample — every element type in 12 seconds
00:00.00 --> 00:12.00 scene bg=#0B0F14 grid=rgba(255,255,255,0.05) accent=#16202C vignette=0.55

00:00.00 --> 00:03.40 camera x=0.5 y=0.5 zoom=1.06
00:03.40 --> 00:12.00 camera x=0.5 y=0.5 zoom=1

# S1 — title
00:00.15 --> 00:03.30 text "Write motion." pos=0.5,0.40 size=112 weight=800 w=0.86 color=#F4F2EE in=charIn inDur=0.75 out=blurOut outDur=0.35 z=5
00:00.95 --> 00:03.30 text "A recipe in. A film out." pos=0.5,0.52 size=38 weight=500 w=0.8 color=#9A968E in=fadeUp inDur=0.5 out=blurOut outDur=0.3 z=5
00:01.10 --> 00:03.30 shape ring pos=0.5,0.40 w=1080 h=300 thick=0.004 color=#8B93F8 growTo=w,1080,1320,1.10,2.40 keys=opacity:1.10=0.65,2.40=0 z=1 in=none out=blurOut outDur=0.3

# S2 — the button
00:03.50 --> 00:07.60 text "One line of text" pos=0.5,0.24 size=64 weight=700 w=0.7 color=#F4F2EE in=wordIn inDur=0.5 out=blurOut outDur=0.3 z=6
00:03.80 --> 00:07.60 shape pill pos=0.5,0.46 w=520 h=132 grad=#8B93F8,#5A63C4 stroke=2 strokeColor=#F4F2EE glow=0.5 z=4 keys=scale:3.80=0.6,3.99=1.1,4.10=1 out=scaleDown outDur=0.3
00:03.90 --> 00:07.60 text "Preview" pos=0.5,0.46 size=52 weight=800 w=0.4 color=#0F1012 z=5 in=popIn inDur=0.3 out=scaleDown outDur=0.3
00:04.20 --> 00:07.60 shape circle pos=0.72,0.60 w=46 color=#F4F2EE z=9 in=none out=fadeOut outDur=0.2 keys=x:4.20=0.72,4.75=0.56;y:4.20=0.60,4.75=0.50;opacity:4.20=0,4.32=1
00:04.90 --> 00:07.60 text "0.4 seconds later" pos=0.5,0.64 size=36 weight=600 w=0.6 color=#8B93F8 in=fadeUp inDur=0.4 out=blurOut outDur=0.3 z=6

# S3 — the checklist
00:07.70 --> 00:12.00 text "3 · Layers" pos=0.5,0.16 size=48 weight=800 w=0.6 color=#F4F2EE in=charIn inDur=0.4 z=6

00:08.00 --> 00:11.80 card pos=0.5,0.34 w=980 h=104 grad=#16181D,#101114 stroke=2 strokeColor=#26282D radius=26 z=3 in=fadeUp inDur=0.35
00:08.15 --> 00:11.80 text "Text" pos=0.30,0.34 size=34 weight=700 w=0.3 color=#F4F2EE z=4 in=fadeUp inDur=0.3
00:08.30 --> 00:11.80 shape check pos=0.72,0.34 w=54 thick=0.16 color=#8B93F8 z=5 in=popIn inDur=0.3

00:08.35 --> 00:11.80 card pos=0.5,0.47 w=980 h=104 grad=#16181D,#101114 stroke=2 strokeColor=#26282D radius=26 z=3 in=fadeUp inDur=0.35
00:08.50 --> 00:11.80 text "Shape" pos=0.31,0.47 size=34 weight=700 w=0.31 color=#F4F2EE z=4 in=fadeUp inDur=0.3
00:08.65 --> 00:11.80 shape check pos=0.72,0.47 w=54 thick=0.16 color=#8B93F8 z=5 in=popIn inDur=0.3

00:08.70 --> 00:11.80 card pos=0.5,0.60 w=980 h=104 grad=#16181D,#101114 stroke=2 strokeColor=#26282D radius=26 z=3 in=fadeUp inDur=0.35
00:08.85 --> 00:11.80 text "Motion" pos=0.32,0.60 size=34 weight=700 w=0.32 color=#F4F2EE z=4 in=fadeUp inDur=0.3
00:09.00 --> 00:11.80 shape check pos=0.72,0.60 w=54 thick=0.16 color=#8B93F8 z=5 in=popIn inDur=0.3

# S4 — the payoff
00:09.40 --> 00:12.00 text "12" pos=0.42,0.80 size=96 weight=800 w=0.3 color=#8B93F8 count=0,12,9.40,10.20 glow=0.4 z=6 in=none out=blurOut outDur=0.3
00:09.55 --> 00:12.00 text "layer types" pos=0.60,0.82 size=40 weight=600 w=0.4 color=#9A968E in=fadeUp inDur=0.4 z=6
00:10.30 --> 00:12.00 text "Rendered in your browser." pos=0.5,0.90 size=32 weight=500 w=0.7 color=#6E6A63 in=fadeUp inDur=0.4 z=6
`;
