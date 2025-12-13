FROM python:alpine3.19

WORKDIR /app

COPY requirements.txt .

RUN python -v
RUN pip intall --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "/app/main.py"]