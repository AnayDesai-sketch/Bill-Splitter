# Split the Bill From a Photograph

A bill-splitting application that takes a photograph of a restaurant bill, extracts the bill details using OCR, allows the user to review and correct the extracted information, and then calculates how much each person owes.

## Features

- Upload 1–4 photographs of a bill.
- Local OCR extracts bill line items and amounts.
- Supports multiple bill photographs.
- Pydantic validates the structured bill data on the FastAPI backend.
- Review and correct OCR results before performing any calculations.
- Add 2–7 people.
- Assign each item to one person, multiple people, or everyone.
- Shared items are split equally among the people assigned to that item.
- Tax and service charge are distributed in proportion to what each person actually ate.
- Discounts are included in the final calculation.
- Printed-total mismatches are flagged.
- Shows a detailed amount owed by each person.

## Tech Stack

### Frontend

- React
- JavaScript
- CSS
- Lucide React

### Backend

- Python
- FastAPI
- Pydantic
- Tesseract OCR
- Pillow

