#!/usr/bin/env python3
import requests
import base64
import os
import json

# 测试服务器URL
BASE_URL = 'http://localhost:8080/api/upload'

# 创建测试文件
def create_test_file(filename, content):
    with open(filename, 'w') as f:
        f.write(content)
    return filename

def encode_file_to_base64(filename):
    with open(filename, 'rb') as f:
        return base64.b64encode(f.read()).decode('utf-8')

def upload_file(file_data, filename):
    headers = {'Content-Type': 'application/json'}
    data = json.dumps({
        'file_data': f'data:text/plain;base64,{file_data}',
        'filename': filename
    })
    
    try:
        response = requests.post(BASE_URL, headers=headers, data=data)
        return response.status_code, response.json()
    except Exception as e:
        return None, {'error': str(e)}

def run_tests():
    print("开始测试文件上传功能...\n")
    
    # 测试1: 正常上传
    print("测试1: 正常上传文本文件")
    test_file = create_test_file('test.txt', '这是测试内容')
    file_data = encode_file_to_base64(test_file)
    status, result = upload_file(file_data, 'test.txt')
    print(f"状态码: {status}")
    print(f"结果: {result}\n")
    os.remove(test_file)
    
    # 测试2: 缺少参数
    print("测试2: 缺少参数 - 不提供file_data")
    status, result = requests.post(BASE_URL, headers={'Content-Type': 'application/json'}, 
                                  data=json.dumps({'filename': 'test.txt'}))
    print(f"状态码: {status}")
    print(f"结果: {result}\n")
    
    print("测试3: 缺少参数 - 不提供filename")
    status, result = requests.post(BASE_URL, headers={'Content-Type': 'application/json'}, 
                                  data=json.dumps({'file_data': 'data:text/plain;base64,dGVzdA=='}))
    print(f"状态码: {status}")
    print(f"结果: {result}\n")
    
    # 测试4: 不支持的文件类型
    print("测试4: 不支持的文件类型")
    test_file = create_test_file('test.exe', '这是测试内容')
    file_data = encode_file_to_base64(test_file)
    status, result = upload_file(file_data, 'test.exe')
    print(f"状态码: {status}")
    print(f"结果: {result}\n")
    os.remove(test_file)
    
    # 测试5: 无效的base64数据
    print("测试5: 无效的base64数据")
    status, result = upload_file('invalid_base64_data', 'test.txt')
    print(f"状态码: {status}")
    print(f"结果: {result}\n")
    
    # 测试6: 非JSON格式请求
    print("测试6: 非JSON格式请求")
    status, result = requests.post(BASE_URL, data='这不是JSON数据')
    print(f"状态码: {status}")
    try:
        print(f"结果: {result.json()}\n")
    except:
        print(f"结果: {result.text}\n")
    
    print("测试完成！")

if __name__ == '__main__':
    run_tests()