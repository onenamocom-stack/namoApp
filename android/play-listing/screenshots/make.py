"""Writes one 1080x1920 page per Play screenshot: cotton-white base, heading, the phone shot."""
import io, os
D = os.path.dirname(os.path.abspath(__file__))
SHOTS = [
    ("s1-darshan", "Live darshan", "Temples across India. Swipe from one deity to the next."),
    ("s2-status", "A new status every day", "Vrat, tithi and festival cards, ready to share."),
    ("s3-jaap", "Mantra jaap counter", "Tap anywhere. The ghanta rings when your mala is complete."),
    ("s4-consult", "Talk to an astrologer", "Chat, audio or video. See the rate before you start."),
    ("s5-chart", "Your kundli, every day", "A daily prediction from your own chart."),
    ("s6-home", "Your bhakti feed", "Posts and reels from people who share your faith."),
]
PAGE = """<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&display=swap" rel="stylesheet">
<style>
* {{ margin: 0; box-sizing: border-box; }}
html, body {{ width: 1080px; height: 1920px; overflow: hidden; }}
body {{ font-family: Poppins, sans-serif; background: #FBFAF6; position: relative; }}
.weave {{ position: absolute; inset: 0; opacity: .035;
  background-image: repeating-linear-gradient(0deg, #6b5a3a 0 1px, transparent 1px 6px),
                    repeating-linear-gradient(90deg, #6b5a3a 0 1px, transparent 1px 6px); }}
.head {{ position: absolute; top: 96px; left: 80px; right: 80px; text-align: center; }}
.tick {{ width: 72px; height: 8px; border-radius: 4px; margin: 0 auto 30px;
  background: linear-gradient(90deg, #E8762C 0 50%, #0F766E 50% 85%, #4C9A3F 85%); }}
h1 {{ font-size: 76px; line-height: 1.1; font-weight: 700; color: #2B1A0E; }}
p {{ margin-top: 22px; font-size: 38px; line-height: 1.35; font-weight: 500; color: #0F766E; }}
.phone {{ position: absolute; left: 50%; transform: translateX(-50%); top: 420px;
  width: 730px; border-radius: 56px; overflow: hidden; border: 14px solid #2B1A0E;
  box-shadow: 0 40px 90px rgba(60,40,15,.25); background: #fff; }}
.phone img {{ display: block; width: 100%; }}
</style></head><body><div class="weave"></div>
<div class="head"><div class="tick"></div><h1>{title}</h1><p>{sub}</p></div>
<div class="phone"><img src="{img}"></div>
</body></html>"""
for key, title, sub in SHOTS:
    io.open(os.path.join(D, key + ".html"), "w", encoding="utf-8").write(
        PAGE.format(title=title, sub=sub, img=key + "-c.png"))
print("ok")
