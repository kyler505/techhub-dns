from pydantic import BaseModel, Field
from typing import List, Optional, Dict

class SignaturePlacement(BaseModel):
    page_number: int = 1
    x: float
    y: float
    width: float
    height: float

class SignatureData(BaseModel):
    signature_image: str  # Base64 encoded PNG
    placements: List[SignaturePlacement] = []
    # Backward compatibility (optional)
    page_number: Optional[int] = None
    position: Optional[Dict[str, float]] = None

print("Classes defined successfully")
d = SignatureData(signature_image="test")
print("Instantiation successful")
