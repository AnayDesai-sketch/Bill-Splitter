
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageOps, ImageEnhance, ImageFilter
import pytesseract
from pydantic import BaseModel, Field
from typing import List, Dict
import io, re

app = FastAPI(title="Split The Bill API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class BillItem(BaseModel):
    name: str
    quantity: float = 1
    price: float
    confidence: str = "medium"

class Bill(BaseModel):
    currency: str = "₹"
    items: List[BillItem] = Field(default_factory=list)
    subtotal: float = 0
    discount: float = 0
    service_charge: float = 0
    tax: float = 0
    total: float = 0
    confidence: Dict[str, str] = Field(default_factory=dict)

MONEY = r"(-?\d+(?:[.,]\d{1,2})?)"

def money(s: str) -> float:
    return float(s.replace(",", ""))

def preprocess(img: Image.Image) -> Image.Image:
    img = ImageOps.exif_transpose(img).convert("L")
    # Upscale makes small thermal-print text easier for Tesseract.
    w, h = img.size
    if w < 1600:
        scale = 1600 / max(w, 1)
        img = img.resize((int(w*scale), int(h*scale)))
    img = ImageOps.autocontrast(img)
    img = ImageEnhance.Sharpness(img).enhance(1.5)
    return img

def extract_number_from_end(line: str):
    m = re.search(MONEY + r"\s*$", line)
    return money(m.group(1)) if m else None

def parse_bill(text: str) -> Bill:
    lines = [re.sub(r"\s+", " ", x).strip() for x in text.splitlines()]
    lines = [x for x in lines if x]
    items=[]
    subtotal=discount=service=tax=total=0.0
    conf={"subtotal":"medium","discount":"medium","service_charge":"medium","tax":"medium","total":"medium"}

    # Indian/common receipt labels. We intentionally keep parsing conservative;
    # anything uncertain is editable on the Review screen.
    for line in lines:
        low=line.lower()
        value=extract_number_from_end(line)

        if value is not None:
            if re.search(r"\b(grand\s*total|total\s*amount|amount\s*payable|net\s*amount)\b",low):
                total=value; conf["total"]="high"; continue
            if re.search(r"\b(sub\s*total|subtotal)\b",low):
                subtotal=value; conf["subtotal"]="high"; continue
            if re.search(r"\b(discount|disc)\b",low):
                discount=value; conf["discount"]="high"; continue
            if re.search(r"\b(service\s*charge|svc\s*charge|service)\b",low):
                service+=value; conf["service_charge"]="high"; continue
            if re.search(r"\b(gst|cgst|sgst|igst|vat|tax)\b",low):
                tax+=value; conf["tax"]="high"; continue

            # Skip obvious non-item lines.
            if re.search(r"\b(invoice|bill no|table|date|time|cashier|phone|address|thank|change|round off)\b",low):
                continue

            # A conservative item candidate: some text + trailing price.
            name_part=re.sub(MONEY+r"\s*$","",line).strip(" -.:")
            if len(name_part) >= 2 and not re.fullmatch(r"[\d\s./:-]+", name_part):
                qty=1
                qm=re.match(r"^(\d+(?:\.\d+)?)\s*[xX×]\s*(.+)$",name_part)
                if qm:
                    qty=float(qm.group(1)); name_part=qm.group(2).strip()
                items.append(BillItem(name=name_part[:80],quantity=qty,price=value,confidence="medium"))

    # If no subtotal was printed, use detected item lines.
    if subtotal == 0 and items:
        subtotal=round(sum(x.price for x in items),2)
        conf["subtotal"]="medium"

    if total == 0:
        total=round(subtotal-discount+service+tax,2)
        conf["total"]="medium"

    # Avoid interpreting tiny/noisy OCR lines as items.
    if len(items)>40:
        items=items[:40]

    return Bill(
        currency="₹",
        items=items,
        subtotal=round(subtotal,2),
        discount=round(discount,2),
        service_charge=round(service,2),
        tax=round(tax,2),
        total=round(total,2),
        confidence=conf,
    )

@app.get("/api/health")
def health():
    return {"ok": True}

@app.post("/api/extract", response_model=Bill)
async def extract(files: List[UploadFile] = File(...)):
    if not files:
        raise HTTPException(400, "Upload at least one image.")

    all_text=[]
    for f in files[:4]:
        if not (f.content_type or "").startswith("image/"):
            continue
        raw=await f.read()
        try:
            img=Image.open(io.BytesIO(raw))
            img=preprocess(img)
            text=pytesseract.image_to_string(img, config="--psm 6")
            all_text.append(text)
        except Exception as e:
            raise HTTPException(400, f"Could not read image: {e}")

    if not all_text:
        raise HTTPException(400, "No valid image files received.")

    return parse_bill("\n".join(all_text))
