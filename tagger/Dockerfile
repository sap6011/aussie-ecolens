# Stage 1 — build dependencies with modern GCC
FROM python:3.11-slim-bookworm AS builder

RUN apt-get update && apt-get install -y \
    cmake gcc g++ libprotobuf-dev protobuf-compiler git \
    && rm -rf /var/lib/apt/lists/*

RUN pip install "numpy==1.26.4" --only-binary=:all: --target /deps
RUN pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu --target /deps
RUN pip install onnx2torch pillow boto3 --prefer-binary --target /deps

RUN git clone --depth 1 https://github.com/agentmorris/MegaDetector.git /tmp/md && \
    cp -r /tmp/md/megadetector /deps/megadetector && \
    rm -rf /tmp/md

# Stage 2 — Lambda-compatible image
FROM public.ecr.aws/lambda/python:3.11

COPY --from=builder /deps ${LAMBDA_TASK_ROOT}
COPY lambda_function.py ${LAMBDA_TASK_ROOT}/

CMD ["lambda_function.lambda_handler"]