#!/usr/bin/env python3
"""LLM Endpoint Performance Benchmark Script"""

import requests
import time
import json
from datetime import datetime

# Configuration
ENDPOINTS = {
    "DashScope (glm-4.7)": {
        "url": "https://coding.dashscope.aliyuncs.com/v1/chat/completions",
        "api_key": "sk-sp-8651e13b3b5a4aeca221932bd573e080",
        "model": "glm-4.7"
    },
    "Volcengine (kimi-k2.5)": {
        "url": "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
        "api_key": "803de240-5683-4ce3-9cbd-0ad5192db942",
        "model": "kimi-k2.5"
    },
    "Volcengine (glm-4.7)": {
        "url": "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
        "api_key": "803de240-5683-4ce3-9cbd-0ad5192db942",
        "model": "glm-4.7"
    }
}

TEST_PROMPTS = [
    {
        "name": "Simple Completion",
        "prompt": "Hello, respond with just 'OK'",
        "max_tokens": 10
    },
    {
        "name": "Chat Completion (Math)",
        "prompt": "What is 2+2? Reply with just the number.",
        "max_tokens": 10
    },
    {
        "name": "Longer Context (Interview)",
        "prompt": "I am conducting a technical interview for a software engineering position. The candidate has 5 years of experience with Python and distributed systems. Please suggest three follow-up questions I should ask to evaluate their problem-solving skills and system design knowledge.",
        "max_tokens": 200
    }
]

def test_endpoint(name, config, prompt, max_tokens):
    """Test a single endpoint with a prompt and return timing data."""
    headers = {
        "Authorization": f"Bearer {config['api_key']}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": config["model"],
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens
    }

    result = {
        "endpoint": name,
        "model": config["model"],
        "success": False,
        "total_time": None,
        "ttfb": None,
        "response": None,
        "error": None
    }

    try:
        start_time = time.time()
        response = requests.post(
            config["url"],
            headers=headers,
            json=payload,
            timeout=60,
            stream=True
        )

        # Time to first byte
        first_chunk_time = None
        chunks = []

        for chunk in response.iter_content(chunk_size=1):
            if first_chunk_time is None:
                first_chunk_time = time.time()
            chunks.append(chunk)

        end_time = time.time()

        result["total_time"] = end_time - start_time
        result["ttfb"] = first_chunk_time - start_time if first_chunk_time else None
        result["success"] = response.status_code == 200

        # Parse response
        full_response = b"".join(chunks).decode("utf-8")
        try:
            response_json = json.loads(full_response)
            result["response"] = response_json.get("choices", [{}])[0].get("message", {}).get("content", "")[:100]
        except json.JSONDecodeError:
            result["response"] = full_response[:100]

        if response.status_code != 200:
            result["error"] = f"HTTP {response.status_code}: {full_response[:200]}"

    except requests.exceptions.Timeout:
        result["error"] = "Request timeout (>60s)"
    except requests.exceptions.ConnectionError as e:
        result["error"] = f"Connection error: {str(e)[:100]}"
    except Exception as e:
        result["error"] = f"Error: {str(e)[:100]}"

    return result

def run_benchmark():
    """Run the full benchmark suite."""
    print("=" * 80)
    print("LLM ENDPOINT PERFORMANCE BENCHMARK")
    print(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)
    print()

    all_results = []

    for endpoint_name, config in ENDPOINTS.items():
        print(f"\n{'='*80}")
        print(f"Testing: {endpoint_name}")
        print(f"URL: {config['url']}")
        print(f"Model: {config['model']}")
        print("=" * 80)

        for test in TEST_PROMPTS:
            print(f"\n  Test: {test['name']}")
            result = test_endpoint(endpoint_name, config, test['prompt'], test['max_tokens'])
            all_results.append(result)

            if result['success']:
                print(f"    Status: SUCCESS")
                print(f"    Total Time: {result['total_time']*1000:.0f}ms")
                print(f"    TTFB: {result['ttfb']*1000:.0f}ms" if result['ttfb'] else "    TTFB: N/A")
                print(f"    Response: {result['response'][:80]}...")
            else:
                print(f"    Status: FAILED")
                print(f"    Error: {result['error']}")

    # Summary table
    print("\n" + "=" * 80)
    print("PERFORMANCE COMPARISON TABLE")
    print("=" * 80)
    print()
    print(f"{'Endpoint':<30} {'Test':<25} {'Total (ms)':<12} {'TTFB (ms)':<12} {'Status':<10}")
    print("-" * 90)

    for r in all_results:
        status = "OK" if r['success'] else "FAILED"
        total = f"{r['total_time']*1000:.0f}" if r['total_time'] else "N/A"
        ttfb = f"{r['ttfb']*1000:.0f}" if r['ttfb'] else "N/A"
        print(f"{r['endpoint']:<30} {TEST_PROMPTS[all_results.index(r) % len(TEST_PROMPTS)]['name']:<25} {total:<12} {ttfb:<12} {status:<10}")

    # Calculate averages
    print("\n" + "=" * 80)
    print("AVERAGE RESPONSE TIMES BY ENDPOINT")
    print("=" * 80)
    print()

    endpoint_averages = {}
    for r in all_results:
        if r['success'] and r['total_time']:
            if r['endpoint'] not in endpoint_averages:
                endpoint_averages[r['endpoint']] = {'total': [], 'ttfb': []}
            endpoint_averages[r['endpoint']]['total'].append(r['total_time'])
            if r['ttfb']:
                endpoint_averages[r['endpoint']]['ttfb'].append(r['ttfb'])

    print(f"{'Endpoint':<30} {'Avg Total (ms)':<15} {'Avg TTFB (ms)':<15}")
    print("-" * 60)
    for name, times in endpoint_averages.items():
        avg_total = sum(times['total']) / len(times['total']) * 1000
        avg_ttfb = sum(times['ttfb']) / len(times['ttfb']) * 1000 if times['ttfb'] else 0
        print(f"{name:<30} {avg_total:<15.0f} {avg_ttfb:<15.0f}")

    # Recommendation
    print("\n" + "=" * 80)
    print("RECOMMENDATION")
    print("=" * 80)

    if endpoint_averages:
        fastest = min(endpoint_averages.items(), key=lambda x: sum(x[1]['total'])/len(x[1]['total']))
        print(f"\nFastest endpoint: {fastest[0]}")
        print(f"Average response time: {sum(fastest[1]['total'])/len(fastest[1]['total'])*1000:.0f}ms")

    return all_results

if __name__ == "__main__":
    run_benchmark()