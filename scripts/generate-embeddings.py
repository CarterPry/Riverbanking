#!/usr/bin/env python3
"""
Generate embeddings for SOC2 testing platform
Loads attack patterns and generates embeddings using OpenAI
"""

import json
import requests
import sys
import time
import hashlib
import os
from typing import List, Dict, Any
from datetime import datetime

# Try to load from .env file
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    print("Note: python-dotenv not installed. Using environment variables or defaults.")

# Configuration
EMBEDDING_API_URL = os.getenv('EMBEDDING_API_URL', 'https://api.openai.com/v1/embeddings')
MODEL_NAME = 'text-embedding-ada-002'
OUTPUT_FILE = 'embeddings.json'

# Get OpenAI API key from environment
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
if not OPENAI_API_KEY:
    print("WARNING: OPENAI_API_KEY not found in environment variables!")
    print("Please set OPENAI_API_KEY or install python-dotenv and add it to .env file")

# Curated attack patterns from the blueprint
ATTACK_PATTERNS = [
    {
        "attack_id": "blind-sql-injection",
        "attack_name": "Blind SQL Injection",
        "description": "Injects SQL to infer data existence through application behavior without visible output",
        "attack_type": "Blind SQL Injection",
        "tsc": ["Security"],
        "cc": ["CC6.1", "CC7.1"],
        "requires_auth": True,
        "progressive": True
    },
    {
        "attack_id": "xss-detection",
        "attack_name": "Cross-Site Scripting Detection",
        "description": "Tests for Cross-Site Scripting vulnerabilities by injecting malicious scripts",
        "attack_type": "Cross-Site Scripting (XSS)",
        "tsc": ["Security"],
        "cc": ["CC6.1", "CC7.2"],
        "requires_auth": False,
        "progressive": True
    },
    {
        "attack_id": "clickjacking",
        "attack_name": "Clickjacking Analysis",
        "description": "Checks for clickjacking vulnerabilities through header analysis and frame testing",
        "attack_type": "Clickjacking",
        "tsc": ["Security"],
        "cc": ["CC6.1"],
        "requires_auth": False,
        "progressive": False
    },
    {
        "attack_id": "port-scanning",
        "attack_name": "Comprehensive Port Scan",
        "description": "Comprehensive port scan to identify exposed services and potential attack vectors",
        "attack_type": "Port Scanning",
        "tsc": ["Availability", "Security"],
        "cc": ["CC6.6", "CC7.1"],
        "requires_auth": False,
        "progressive": True
    },
    {
        "attack_id": "authentication-brute-force",
        "attack_name": "Authentication Brute Force",
        "description": "Tests authentication mechanisms for weak credentials and lockout policies",
        "attack_type": "Authentication Brute Force",
        "tsc": ["Security", "Authentication"],
        "cc": ["CC6.1", "CC6.2"],
        "requires_auth": False,
        "progressive": True
    },
    {
        "attack_id": "session-token-analysis",
        "attack_name": "Session Token Security Analysis",
        "description": "Analyzes session tokens for randomness, entropy, and security properties",
        "attack_type": "Session Token Security",
        "tsc": ["Security", "Authentication"],
        "cc": ["CC6.1", "CC6.3"],
        "requires_auth": True,
        "progressive": False
    },
    {
        "attack_id": "privilege-escalation",
        "attack_name": "Privilege Escalation Testing",
        "description": "Tests for privilege escalation vulnerabilities in user role management",
        "attack_type": "Privilege Escalation",
        "tsc": ["Security", "Authorization"],
        "cc": ["CC6.1", "CC6.3", "CC7.2"],
        "requires_auth": True,
        "progressive": True
    },
    {
        "attack_id": "data-validation",
        "attack_name": "Input Validation Testing",
        "description": "Tests input validation and data integrity controls across all entry points",
        "attack_type": "Input Validation",
        "tsc": ["Data Integrity", "Security"],
        "cc": ["CC6.1", "CC7.3"],
        "requires_auth": False,
        "progressive": True
    },
    {
        "attack_id": "ssl-tls-analysis",
        "attack_name": "SSL/TLS Configuration Analysis",
        "description": "Analyzes SSL/TLS configuration for security weaknesses and compliance",
        "attack_type": "SSL/TLS Security",
        "tsc": ["Security", "Availability"],
        "cc": ["CC6.1", "CC6.7"],
        "requires_auth": False,
        "progressive": False
    },
    {
        "attack_id": "api-security-scan",
        "attack_name": "Comprehensive API Security Testing",
        "description": "Comprehensive API security testing including authentication, authorization, and data exposure",
        "attack_type": "API Security",
        "tsc": ["Security", "Data Integrity"],
        "cc": ["CC6.1", "CC7.1", "CC7.2"],
        "requires_auth": True,
        "progressive": True
    }
]

# Additional TSC and CC descriptions for embeddings
TSC_DESCRIPTIONS = {
    "Security": "Trust Service Criteria for Security - Protects against unauthorized access",
    "Availability": "Trust Service Criteria for Availability - Ensures system operational and accessible",
    "Processing Integrity": "Trust Service Criteria for Processing Integrity - System processing is complete, valid, accurate, timely",
    "Confidentiality": "Trust Service Criteria for Confidentiality - Information designated as confidential is protected",
    "Privacy": "Trust Service Criteria for Privacy - Personal information is collected, used, retained, disclosed, and disposed"
}

CC_DESCRIPTIONS = {
    "CC6.1": "Logical and Physical Access Controls - Restricts logical and physical access",
    "CC6.2": "Prior to Issuing System Credentials - Registers and authorizes new users",
    "CC6.3": "Considers and Manages Entity Behavior - Manages points of access",
    "CC6.6": "Logical Access Security Measures - Implements logical access security measures",
    "CC6.7": "Restricts Access - Transmission, movement, and removal of information restricted",
    "CC7.1": "To Meet Objectives - Uses detection and monitoring procedures",
    "CC7.2": "Monitors System Components - Monitors system components for anomalies",
    "CC7.3": "Evaluates Security Events - Evaluates security events for determination of impact"
}


def generate_embedding(text: str, retry_count: int = 3) -> List[float]:
    """Generate embedding for given text using OpenAI API"""
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {OPENAI_API_KEY}',
    }
    
    for attempt in range(retry_count):
        try:
            response = requests.post(
                EMBEDDING_API_URL,
                json={
                    'input': text,
                    'model': MODEL_NAME
                },
                headers=headers,
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                if 'data' in data and len(data['data']) > 0 and 'embedding' in data['data'][0]:
                    return data['data'][0]['embedding']
                else:
                    print(f"Warning: No embedding in response for text: {text[:50]}...")
                    return None
            else:
                print(f"Error {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            print(f"Request error (attempt {attempt + 1}/{retry_count}): {e}")
            if attempt < retry_count - 1:
                time.sleep(2 ** attempt)  # Exponential backoff
                
    return None


def generate_mock_embedding(text: str, dimension: int = 768) -> List[float]:
    """Generate deterministic mock embedding for development"""
    # Create hash of text
    text_hash = hashlib.sha256(text.encode()).digest()
    
    # Generate deterministic values
    embedding = []
    for i in range(dimension):
        # Use hash bytes to generate values between -1 and 1
        byte_val = text_hash[i % len(text_hash)]
        embedding.append((byte_val - 128) / 128)
    
    return embedding


def main():
    """Main function to generate embeddings"""
    print(f"Generating embeddings using {MODEL_NAME}")
    print(f"API URL: {EMBEDDING_API_URL}")
    print("-" * 50)
    
    embeddings_data = {
        "metadata": {
            "generated_at": datetime.now().isoformat(),
            "model": MODEL_NAME,
            "total_patterns": len(ATTACK_PATTERNS),
            "api_url": EMBEDDING_API_URL
        },
        "attack_patterns": {},
        "tsc_descriptions": {},
        "cc_descriptions": {}
    }
    
    # Check if OpenAI API key is available
    if not OPENAI_API_KEY or OPENAI_API_KEY.startswith('sk-'):
        print("✓ OpenAI API key configured")
    else:
        print("✗ OpenAI API key not found, using mock embeddings")
    
    print("-" * 50)
    
    # Generate embeddings for attack patterns
    print("Generating attack pattern embeddings...")
    for i, pattern in enumerate(ATTACK_PATTERNS):
        print(f"[{i+1}/{len(ATTACK_PATTERNS)}] {pattern['attack_name']}")
        
        # Create comprehensive text for embedding
        pattern_text = f"{pattern['attack_name']}: {pattern['description']}"
        
        embedding = generate_embedding(pattern_text)
        if not embedding:
            embedding = generate_mock_embedding(pattern_text)
        
        if embedding:
            embeddings_data["attack_patterns"][pattern["attack_id"]] = {
                "text": pattern_text,
                "embedding": embedding,
                "metadata": {
                    "attack_type": pattern["attack_type"],
                    "tsc": pattern["tsc"],
                    "cc": pattern["cc"],
                    "requires_auth": pattern["requires_auth"],
                    "progressive": pattern["progressive"]
                }
            }
        else:
            print(f"  ⚠ Failed to generate embedding")
    
    # Generate embeddings for TSC descriptions
    print("\nGenerating TSC embeddings...")
    for tsc, description in TSC_DESCRIPTIONS.items():
        print(f"- {tsc}")
        
        embedding = generate_embedding(description)
        if not embedding:
            embedding = generate_mock_embedding(description)
            
        if embedding:
            embeddings_data["tsc_descriptions"][tsc] = {
                "text": description,
                "embedding": embedding
            }
    
    # Generate embeddings for CC descriptions
    print("\nGenerating CC embeddings...")
    for cc, description in CC_DESCRIPTIONS.items():
        print(f"- {cc}")
        
        embedding = generate_embedding(description)
        if not embedding:
            embedding = generate_mock_embedding(description)
            
        if embedding:
            embeddings_data["cc_descriptions"][cc] = {
                "text": description,
                "embedding": embedding
            }
    
    # Save to file
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(embeddings_data, f, indent=2)
    
    print("-" * 50)
    print(f"✓ Embeddings saved to {OUTPUT_FILE}")
    print(f"  - Attack patterns: {len(embeddings_data['attack_patterns'])}")
    print(f"  - TSC descriptions: {len(embeddings_data['tsc_descriptions'])}")
    print(f"  - CC descriptions: {len(embeddings_data['cc_descriptions'])}")
    
    # Also create SQL insert script
    create_sql_script(embeddings_data)
    

def create_sql_script(embeddings_data: Dict[str, Any]):
    """Create SQL script to insert embeddings into database"""
    sql_file = "insert_embeddings.sql"
    
    with open(sql_file, 'w') as f:
        f.write("-- SQL script to insert pre-generated embeddings\n")
        f.write("-- Generated at: " + embeddings_data["metadata"]["generated_at"] + "\n\n")
        
        f.write("BEGIN;\n\n")
        
        # Insert attack patterns
        f.write("-- Insert attack patterns with embeddings\n")
        for attack_id, data in embeddings_data["attack_patterns"].items():
            pattern = next(p for p in ATTACK_PATTERNS if p["attack_id"] == attack_id)
            
            embedding_str = '[' + ','.join(map(str, data["embedding"])) + ']'
            tsc_str = '{' + ','.join(f'"{t}"' for t in pattern["tsc"]) + '}'
            cc_str = '{' + ','.join(f'"{c}"' for c in pattern["cc"]) + '}'
            
            f.write(f"""
INSERT INTO soc2.attack_patterns (
    attack_id, attack_name, description, attack_type,
    embedding, tsc, cc, tools, requires_auth,
    progressive, evidence_required, metadata
) VALUES (
    '{attack_id}',
    '{pattern["attack_name"].replace("'", "''")}',
    '{pattern["description"].replace("'", "''")}',
    '{pattern["attack_type"]}',
    '{embedding_str}'::vector,
    '{tsc_str}',
    '{cc_str}',
    '[]'::jsonb,
    {str(pattern["requires_auth"]).lower()},
    {str(pattern["progressive"]).lower()},
    '{{}}'::text[],
    '{{}}'::jsonb
) ON CONFLICT (attack_id) DO UPDATE SET
    embedding = EXCLUDED.embedding,
    updated_at = CURRENT_TIMESTAMP;
""")
        
        f.write("\nCOMMIT;\n")
    
    print(f"✓ SQL script saved to {sql_file}")


if __name__ == "__main__":
    main() 