FROM public.ecr.aws/lambda/python:3.12

RUN dnf install -y git && dnf clean all

RUN pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

RUN pip install onnx2torch pillow boto3 \
    humanfriendly tqdm jsonpickle requests \
    matplotlib opencv-python-headless \
    scikit-learn pandas --prefer-binary

RUN git clone --depth 1 https://github.com/agentmorris/MegaDetector.git /tmp/md && \
    cp -r /tmp/md/megadetector ${LAMBDA_TASK_ROOT}/megadetector && \
    rm -rf /tmp/md

COPY lambda_function.py ${LAMBDA_TASK_ROOT}/

CMD ["lambda_function.lambda_handler"]