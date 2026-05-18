import fitz

pdf_path = "c:/startingup/TheHoloVision/PR_deck/MBOX_Complete_Presentation_black_pdf.pdf"
out_path = "c:/startingup/TheHoloVision/PR_deck/extracted_text.txt"

try:
    doc = fitz.open(pdf_path)
    with open(out_path, "w", encoding="utf-8") as f:
        for i, page in enumerate(doc):
            f.write(f"--- PAGE {i+1} ---\n")
            f.write(page.get_text() + "\n\n")
    print("Done")
except Exception as e:
    print(f"Error: {e}")
