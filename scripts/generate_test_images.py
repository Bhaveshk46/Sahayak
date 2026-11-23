import os
from PIL import Image, ImageDraw, ImageFont

# Directories to save
output_dirs = [
    r"c:\Users\bhavesh kumawat\Downloads\wHACKiest\test-documents",
    r"c:\Users\bhavesh kumawat\Downloads\wHACKiest\demo-forms\public\sample-docs"
]

for d in output_dirs:
    os.makedirs(d, exist_ok=True)

def get_font(size):
    try:
        return ImageFont.truetype("arial.ttf", size)
    except:
        return ImageFont.load_default()

def get_bold_font(size):
    try:
        return ImageFont.truetype("arialbd.ttf", size)
    except:
        return get_font(size)

# ==========================================
# 1. Sample Aadhaar Card (800 x 500)
# ==========================================
def create_aadhaar():
    w, h = 800, 500
    img = Image.new("RGB", (w, h), color="#FAFAFA")
    draw = ImageDraw.Draw(img)

    # Tricolor top bar
    draw.rectangle([0, 0, w, 14], fill="#FF9933")  # Saffron
    draw.rectangle([0, 14, w, 28], fill="#FFFFFF")  # White
    draw.rectangle([0, 28, w, 42], fill="#128807")  # Green

    # Header text
    f_header = get_bold_font(20)
    f_sub = get_font(13)
    draw.text((w//2, 60), "GOVERNMENT OF INDIA / UIDAI", fill="#1A365D", font=f_header, anchor="mm")
    draw.text((w//2, 85), "Unique Identification Authority of India", fill="#4A5568", font=f_sub, anchor="mm")
    draw.line([(30, 105), (w-30, 105)], fill="#CBD5E0", width=2)

    # Photo Box
    draw.rectangle([50, 130, 190, 310], fill="#EDF2F7", outline="#718096", width=2)
    f_photo = get_font(12)
    draw.text((120, 220), "[ PHOTO ]", fill="#718096", font=f_photo, anchor="mm")

    # Details
    f_label = get_bold_font(15)
    f_val = get_font(15)
    
    details = [
        ("Name:", "Aditi Ramesh Sharma"),
        ("DOB:", "14/05/2002"),
        ("Gender:", "Female / महिला"),
        ("Mobile:", "9876543210"),
        ("Address:", "Flat 402, Shanti Vihar, MG Road,"),
        ("", "Pune, Maharashtra - 411001")
    ]

    y = 135
    for label, val in details:
        if label:
            draw.text((220, y), label, fill="#2D3748", font=f_label)
        draw.text((310 if label else 220, y), val, fill="#1A202C", font=f_val)
        y += 28

    # QR Code placeholder box
    draw.rectangle([w-190, 130, w-50, 270], fill="#F7FAFC", outline="#4A5568", width=1)
    draw.text((w-120, 200), "[ QR CODE ]\n(Digital Signature)", fill="#4A5568", font=get_font(11), anchor="mm")

    # Big Aadhaar Number at Bottom
    draw.rectangle([30, 380, w-30, 450], fill="#EBF8FF", outline="#3182CE", width=2)
    f_aadhaar = get_bold_font(28)
    draw.text((w//2, 415), "9876  5432  1012", fill="#2B6CB0", font=f_aadhaar, anchor="mm")

    # Footer slogan
    f_footer = get_bold_font(12)
    draw.text((w//2, 475), "मेरा आधार, मेरी पहचान", fill="#718096", font=f_footer, anchor="mm")

    for d in output_dirs:
        img.save(os.path.join(d, "sample_aadhaar_card.png"))
    print("Aadhaar created.")

# ==========================================
# 2. Sample PAN Card (800 x 500)
# ==========================================
def create_pan():
    w, h = 800, 500
    img = Image.new("RGB", (w, h), color="#EBF4FF")  # Pale blue PAN color
    draw = ImageDraw.Draw(img)

    # Top border / Header
    draw.rectangle([0, 0, w, 70], fill="#2B6CB0")
    f_top = get_bold_font(18)
    f_sub = get_font(12)
    draw.text((w//2, 25), "INCOME TAX DEPARTMENT", fill="#FFFFFF", font=f_top, anchor="mm")
    draw.text((w//2, 48), "GOVT. OF INDIA", fill="#E2E8F0", font=f_sub, anchor="mm")

    # Emblem placeholder
    draw.ellipse([40, 12, 85, 57], fill="#FFFFFF", outline="#ECC94B", width=2)
    draw.text((62, 35), "GOI", fill="#2B6CB0", font=get_bold_font(11), anchor="mm")

    # Photo box
    draw.rectangle([50, 100, 180, 260], fill="#FFFFFF", outline="#4A5568", width=2)
    draw.text((115, 180), "[ PHOTO ]", fill="#718096", font=get_font(12), anchor="mm")

    # Details
    f_lbl = get_bold_font(13)
    f_val = get_bold_font(16)

    # Name
    draw.text((210, 100), "Name / नाम", fill="#4A5568", font=f_lbl)
    draw.text((210, 120), "ADITI RAMESH SHARMA", fill="#1A202C", font=f_val)

    # Father's Name
    draw.text((210, 155), "Father's Name / पिता का नाम", fill="#4A5568", font=f_lbl)
    draw.text((210, 175), "RAMESH SHARMA", fill="#1A202C", font=f_val)

    # Date of Birth
    draw.text((210, 210), "Date of Birth / जन्म तिथि", fill="#4A5568", font=f_lbl)
    draw.text((210, 230), "14/05/2002", fill="#1A202C", font=f_val)

    # Hologram box
    draw.rectangle([w-170, 100, w-50, 180], fill="#FEFCBF", outline="#D69E2E", width=1)
    draw.text((w-110, 140), "HOLOGRAM", fill="#B7791F", font=get_bold_font(12), anchor="mm")

    # Signature box
    draw.rectangle([w-230, 210, w-40, 270], fill="#FFFFFF", outline="#718096", width=1)
    draw.text((w-135, 230), "Signature / हस्ताक्षर", fill="#A0AEC0", font=get_font(10), anchor="mm")
    draw.text((w-135, 252), "Aditi Sharma", fill="#2B6CB0", font=get_bold_font(15), anchor="mm")

    # Permanent Account Number (PAN) Box
    draw.rectangle([40, 310, w-40, 420], fill="#FFFFFF", outline="#2B6CB0", width=2)
    draw.text((w//2, 335), "Permanent Account Number / स्थायी खाता संख्या", fill="#4A5568", font=get_bold_font(14), anchor="mm")
    f_pan = get_bold_font(36)
    draw.text((w//2, 380), "ABCDE1234F", fill="#2C5282", font=f_pan, anchor="mm")

    # Footer note
    draw.text((w//2, 460), "Income Tax Department, National Securities Depository Limited", fill="#718096", font=get_font(11), anchor="mm")

    for d in output_dirs:
        img.save(os.path.join(d, "sample_pan_card.png"))
    print("PAN created.")

# ==========================================
# 3. Sample Bank Passbook (800 x 550)
# ==========================================
def create_bank():
    w, h = 800, 550
    img = Image.new("RGB", (w, h), color="#FFFFFF")
    draw = ImageDraw.Draw(img)

    # SBI Blue header
    draw.rectangle([0, 0, w, 70], fill="#0A3B75")
    draw.text((40, 35), "STATE BANK OF INDIA / भारतीय स्टेट बैंक", fill="#FFFFFF", font=get_bold_font(18), anchor="lm")
    draw.text((w-40, 35), "SAVINGS BANK PASSBOOK", fill="#BEE3F8", font=get_bold_font(13), anchor="rm")

    draw.line([(0, 72), (w, 72)], fill="#ECC94B", width=4)

    # Branch Details
    f_meta = get_font(12)
    draw.text((40, 95), "Branch: Pune Main Branch (00123)", fill="#4A5568", font=f_meta)
    draw.text((40, 115), "Address: Connaught Road, Pune, Maharashtra 411001", fill="#4A5568", font=f_meta)
    draw.text((40, 135), "Phone: 020-26123456 | Email: sbi.00123@sbi.co.in", fill="#4A5568", font=f_meta)

    draw.line([(40, 160), (w-40, 160)], fill="#E2E8F0", width=1)

    # Account Specifics Box
    draw.rectangle([40, 180, w-40, 480], fill="#F7FAFC", outline="#CBD5E0", width=1)

    items = [
        ("Account Holder Name:", "Aditi Ramesh Sharma"),
        ("Account Number:", "123456789012"),
        ("Customer ID (CIF):", "87654321098"),
        ("Account Type:", "Savings Bank (SB-CHQ-GEN-PUB-IND)"),
        ("IFSC Code:", "SBIN0001234"),
        ("MICR Code:", "411002005"),
        ("Nominee Registered:", "Yes"),
        ("Date of Issue:", "10/01/2021"),
        ("Mode of Operation:", "Single / Self")
    ]

    f_key = get_bold_font(14)
    f_data = get_font(14)

    y = 200
    for k, v in items:
        draw.text((65, y), k, fill="#2D3748", font=f_key)
        draw.text((300, y), v, fill="#1A202C", font=f_data)
        y += 29

    # Stamp box
    draw.rectangle([w-190, 360, w-60, 460], fill="#FFFFFF", outline="#E53E3E", width=2)
    draw.text((w-125, 395), "STATE BANK OF INDIA\nBRANCH MANAGER\nPUNE MAIN", fill="#E53E3E", font=get_bold_font(10), anchor="mm", align="center")

    for d in output_dirs:
        img.save(os.path.join(d, "sample_bank_passbook.png"))
    print("Bank Passbook created.")

# ==========================================
# 4. Sample Academic Marksheet (800 x 600)
# ==========================================
def create_marksheet():
    w, h = 800, 600
    img = Image.new("RGB", (w, h), color="#FFFFF8")
    draw = ImageDraw.Draw(img)

    # Border
    draw.rectangle([15, 15, w-15, h-15], outline="#744210", width=3)
    draw.rectangle([20, 20, w-20, h-20], outline="#D69E2E", width=1)

    # Header
    draw.text((w//2, 50), "PUNE STATE UNIVERSITY / पुणे विश्वविद्यालय", fill="#744210", font=get_bold_font(20), anchor="mm")
    draw.text((w//2, 78), "OFFICIAL STATEMENT OF MARKS & GRADES", fill="#2D3748", font=get_bold_font(14), anchor="mm")
    draw.text((w//2, 100), "BACHELOR OF TECHNOLOGY (COMPUTER SCIENCE & ENGINEERING)", fill="#4A5568", font=get_bold_font(12), anchor="mm")

    draw.line([(40, 120), (w-40, 120)], fill="#CBD5E0", width=1)

    # Student metadata
    f_lbl = get_bold_font(13)
    f_val = get_font(13)

    draw.text((50, 135), "Candidate Name:", fill="#2D3748", font=f_lbl)
    draw.text((180, 135), "Aditi Ramesh Sharma", fill="#1A202C", font=f_val)

    draw.text((50, 160), "Roll Number:", fill="#2D3748", font=f_lbl)
    draw.text((180, 160), "2021BCSE088", fill="#1A202C", font=f_val)

    draw.text((w//2 + 30, 135), "Institution:", fill="#2D3748", font=f_lbl)
    draw.text((w//2 + 130, 135), "Pune Institute of Tech", fill="#1A202C", font=f_val)

    draw.text((w//2 + 30, 160), "Academic Year:", fill="#2D3748", font=f_lbl)
    draw.text((w//2 + 130, 160), "2023 - 2024 (Semester VI)", fill="#1A202C", font=f_val)

    # Table Header
    draw.rectangle([45, 195, w-45, 225], fill="#ED8936")
    draw.text((60, 210), "Code", fill="#FFFFFF", font=get_bold_font(12), anchor="lm")
    draw.text((150, 210), "Subject Title", fill="#FFFFFF", font=get_bold_font(12), anchor="lm")
    draw.text((450, 210), "Max Marks", fill="#FFFFFF", font=get_bold_font(12), anchor="lm")
    draw.text((560, 210), "Marks Obtained", fill="#FFFFFF", font=get_bold_font(12), anchor="lm")
    draw.text((700, 210), "Grade", fill="#FFFFFF", font=get_bold_font(12), anchor="lm")

    subjects = [
        ("CS601", "Design & Analysis of Algorithms", "100", "89", "A+"),
        ("CS602", "Database Management Systems", "100", "92", "O"),
        ("CS603", "Machine Learning & Neural Nets", "100", "86", "A+"),
        ("CS604", "Computer Networks & Security", "100", "84", "A"),
        ("CS605", "Cloud Computing & DevOps", "100", "91", "O"),
    ]

    y = 230
    for code, title, max_m, obt, grd in subjects:
        draw.rectangle([45, y, w-45, y+28], fill="#FFFFFF" if (y//28)%2==0 else "#F7FAFC")
        draw.text((60, y+14), code, fill="#4A5568", font=f_val, anchor="lm")
        draw.text((150, y+14), title, fill="#1A202C", font=f_val, anchor="lm")
        draw.text((480, y+14), max_m, fill="#4A5568", font=f_val, anchor="lm")
        draw.text((590, y+14), obt, fill="#1A202C", font=get_bold_font(13), anchor="lm")
        draw.text((710, y+14), grd, fill="#2B6CB0", font=get_bold_font(13), anchor="lm")
        y += 28

    # Overall Summary
    draw.rectangle([45, y+15, w-45, y+70], fill="#FEFCBF", outline="#D69E2E", width=1)
    draw.text((70, y+42), "Total: 442 / 500", fill="#744210", font=get_bold_font(15), anchor="lm")
    draw.text((300, y+42), "Marks Percentage: 88.4%", fill="#744210", font=get_bold_font(16), anchor="lm")
    draw.text((600, y+42), "Result: FIRST CLASS WITH DISTINCTION", fill="#276749", font=get_bold_font(13), anchor="lm")

    for d in output_dirs:
        img.save(os.path.join(d, "sample_marksheet.png"))
    print("Marksheet created.")

# ==========================================
# 5. Sample Passport Photo (350 x 450)
# ==========================================
def create_passport_photo():
    w, h = 350, 450
    img = Image.new("RGB", (w, h), color="#E2E8F0")
    draw = ImageDraw.Draw(img)

    # Blue studio backdrop gradient/color
    draw.rectangle([0, 0, w, h], fill="#BEE3F8")

    # Silhouette head
    draw.ellipse([w//2 - 60, 90, w//2 + 60, 230], fill="#CBD5E0", outline="#A0AEC0", width=2)
    # Silhouette torso
    draw.ellipse([w//2 - 130, 230, w//2 + 130, 480], fill="#2B6CB0")

    draw.text((w//2, 320), "PASSPORT PHOTO", fill="#FFFFFF", font=get_bold_font(16), anchor="mm")
    draw.text((w//2, 345), "35mm x 45mm", fill="#E2E8F0", font=get_font(12), anchor="mm")

    # Border
    draw.rectangle([0, 0, w-1, h-1], outline="#A0AEC0", width=2)

    for d in output_dirs:
        img.save(os.path.join(d, "sample_passport_photo.png"))
    print("Passport photo created.")

# ==========================================
# 6. Sample Signature (400 x 180)
# ==========================================
def create_signature():
    w, h = 400, 180
    img = Image.new("RGB", (w, h), color="#FFFFFF")
    draw = ImageDraw.Draw(img)

    # Draw cursive-like signature text
    draw.text((w//2, h//2 - 10), "Aditi Sharma", fill="#1A365D", font=get_bold_font(34), anchor="mm")
    # Swirl line
    draw.line([(70, h//2 + 25), (320, h//2 + 22)], fill="#1A365D", width=3)
    draw.arc([280, h//2 + 10, 340, h//2 + 45], start=0, end=180, fill="#1A365D", width=2)

    draw.rectangle([0, 0, w-1, h-1], outline="#E2E8F0", width=1)

    for d in output_dirs:
        img.save(os.path.join(d, "sample_signature.png"))
    print("Signature created.")

create_aadhaar()
create_pan()
create_bank()
create_marksheet()
create_passport_photo()
create_signature()
print("All sample test images generated successfully!")
