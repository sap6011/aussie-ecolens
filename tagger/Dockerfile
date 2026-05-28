FROM public.ecr.aws/lambda/python:3.12

RUN dnf install -y git && dnf clean all

RUN pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

# Install onnx prebuilt first
RUN pip install "onnx==1.16.2" --only-binary=:all:

# Install onnx2torch without letting it downgrade onnx
RUN pip install onnx2torch --no-deps

# Install ultralytics-yolov5 without onnx dependency
RUN pip install ultralytics-yolov5 --no-deps

# Install remaining dependencies
RUN pip install pillow boto3 humanfriendly tqdm jsonpickle requests \
    matplotlib opencv-python-headless scikit-learn pandas pytest \
    PyYAML scipy seaborn ipython psutil fire tensorboard --prefer-binary

RUN git clone --depth 1 https://github.com/agentmorris/MegaDetector.git /tmp/md && \
    cp -r /tmp/md/megadetector ${LAMBDA_TASK_ROOT}/megadetector && \
    rm -rf /tmp/md

COPY lambda_function.py ${LAMBDA_TASK_ROOT}/

CMD ["lambda_function.lambda_handler"]