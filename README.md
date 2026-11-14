<div align="center">

# 🏙️ H7 Smart City

**An interactive smart city where every sector runs a real AI model, entirely in the browser.**

[**▶ Open the city**](https://h7modi77.github.io/H7-Smart-City/) (live dashboard + 3D tour, works on phones and laptops, no install)

![JavaScript](https://img.shields.io/badge/JavaScript-ES%20modules-F7DF1E?logo=javascript&logoColor=black)
![three.js](https://img.shields.io/badge/three.js-3D%20%2B%20WebXR-000000?logo=threedotjs)
![scikit-learn](https://img.shields.io/badge/scikit--learn-training-F7931E?logo=scikitlearn&logoColor=white)
![Chart.js](https://img.shields.io/badge/Chart.js-dashboards-FF6384?logo=chartdotjs&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

</div>

## What's inside

The whole city is driven by one simulation clock (`js/sim.js`) that streams traffic counts, emergency-room arrivals, power demand, solar output, retail sales, air-quality sensors and smart-bin fill levels. Each sector reads that stream and applies its own model:

| Sector | AI / algorithm | What you can do |
|---|---|---|
| 🚦 **Traffic** | Webster's optimal cycle & green split, Webster delay model | Compare fixed-time vs adaptive signals at 4 junctions. The city gate links to [Saudi-ANPR](https://github.com/H7modi77/Saudi-ANPR) (Arabic + English plate reader). |
| 🏥 **Hospital** | Multinomial logistic regression (quadratic features) for 5-level triage; seasonal demand forecast | Move vital-sign sliders and get a triage level with probabilities. Forecast ER load for the next 6 h and apply the suggested staffing. |
| 🏫 **School** | Neural network (MLP 64-48-10) for handwritten digits | Draw a digit with your finger or mouse. You see the 8×8 input the network receives and its top guesses. |
| 🛒 **Grocery** | Holt-Winters (additive, weekly season, grid-searched parameters); market-basket association rules (support / confidence / lift) | 14-day sales forecast with error band, and "customers who bought X also bought…" recommendations. |
| ⚡ **Energy** | Battery peak-shaving policy on solar + load profiles | Watch batteries charge from solar in the morning and discharge during the afternoon AC peak. |
| 🌫️ **Air quality** | Rolling z-score anomaly detection on 4 sensor streams | Trigger a simulated dust storm and watch the detector flag it. |
| 🗑️ **Waste** | Route optimisation (nearest neighbour + 2-opt) | Collect only the full bins, compare route length to visiting all bins, then dispatch the truck. |

The **3D tour** (three.js) shows the same city: day/night follows the simulation clock, the number of cars follows live traffic, the air-quality beacon changes colour with the AQI, and tapping a landmark opens its AI module. A **WebXR VR** button appears on headsets that support it.

## Models

Trained in Python (`training/train_models.py`) and exported as plain JSON (`models/`). The browser runs them with a few lines of JavaScript and no ML library.

| Model | Data | Result |
|---|---|---|
| Digit MLP | scikit-learn digits, augmented to look like finger drawings and passed through the same preprocessing as the web page | 94.7 % on held-out augmented digits |
| Triage logistic regression | 12,000 synthetic patients | 84.3 % exact level, 98.8 % within one level |

> All data is synthetic and for demonstration. The triage model is an educational example, not a medical tool.

## Run locally

```bash
git clone https://github.com/H7modi77/H7-Smart-City.git && cd H7-Smart-City
python -m http.server 8000          # then open http://localhost:8000
python training/train_models.py     # optional: retrain the models (numpy, scikit-learn, opencv-python)
```

## Structure

```
index.html            app shell (dashboard + 3D tabs)
js/sim.js             city simulation clock and data streams
js/app.js             dashboard, map, alerts feed, module drawer
js/city3d.js          three.js city, landmarks, cars, day/night, WebXR
js/modules/*.js       one file per sector (traffic, hospital, school, grocery, energy, air, waste)
training/             model training scripts
models/               exported model weights (JSON)
```

---

## 🇸🇦 بالعربي

**مدينة ذكية تفاعلية** فيها لوحة تحكم حية وجولة ثلاثية الأبعاد، وكل قطاع فيها يشتغل بنموذج ذكاء اصطناعي حقيقي داخل المتصفح:
- **المرور:** إشارات ذكية، وبوابة لقراءة اللوحات.
- **المستشفى:** فرز حالات الطوارئ وتوقع الضغط.
- **المدرسة:** التعرف على الأرقام المكتوبة بخط اليد.
- **البقالة:** توقع المبيعات واقتراح منتجات.
- **الطاقة:** بطاريات ذكية تخفف ذروة الاستهلاك.
- **جودة الهواء:** اكتشاف القراءات الشاذة.
- **النظافة:** أقصر مسار لجمع النفايات.

[افتح المدينة](https://h7modi77.github.io/H7-Smart-City/)

<div align="center"><br><b>Mohammed Almarhoon</b> · AI student, Imam Abdulrahman Bin Faisal University · <a href="https://github.com/H7modi77">@H7modi77</a></div>
