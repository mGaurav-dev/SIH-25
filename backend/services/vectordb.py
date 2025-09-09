import json
import logging
from pathlib import Path
import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer
import numpy as np
from typing import List, Dict, Tuple, Optional, Set
import re
from tqdm import tqdm
import hashlib
import time

class VectorDatabase:
    def __init__(self, db_path: str = "./chroma_db", model_name: str = "all-MiniLM-L6-v2"):
        """
        Initialize vector database with ChromaDB and SentenceTransformer
        
        Args:
            db_path: Path to store ChromaDB
            model_name: SentenceTransformer model for embeddings
        """
        self.db_path = Path(db_path)
        self.db_path.mkdir(exist_ok=True)
        
        # Initialize ChromaDB
        self.client = chromadb.PersistentClient(
            path=str(self.db_path),
            settings=Settings(
                anonymized_telemetry=False,
                allow_reset=True
            )
        )
        
        # Initialize embedding model
        self.embedding_model = SentenceTransformer(model_name)
        
        # Create or get collection
        self.collection_name = "agricultural_qa"
        try:
            self.collection = self.client.get_collection(self.collection_name)
            logging.info(f"Loaded existing collection: {self.collection_name}")
        except:
            self.collection = self.client.create_collection(
                name=self.collection_name,
                metadata={"hnsw:space": "cosine"}
            )
            logging.info(f"Created new collection: {self.collection_name}")
    
    def clean_text(self, text: str) -> str:
        """Clean text by removing special characters and normalizing"""
        if not text:
            return ""
        
        # Remove special characters except basic punctuation
        text = re.sub(r'[^\w\s.,!?()-]', ' ', str(text))
        
        # Normalize whitespace
        text = ' '.join(text.split())
        
        # Remove extra punctuation
        text = re.sub(r'[.]{2,}', '.', text)
        text = re.sub(r'[!]{2,}', '!', text)
        text = re.sub(r'[?]{2,}', '?', text)
        
        return text.strip()
    
    def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding for given text"""
        cleaned_text = self.clean_text(text)
        embedding = self.embedding_model.encode(cleaned_text)
        return embedding.tolist()
    
    def create_document_id(self, input_text: str, output_text: str) -> str:
        """Create unique document ID from input and output"""
        combined = f"{input_text}|{output_text}"
        return hashlib.md5(combined.encode()).hexdigest()
    
    def get_existing_document_ids(self) -> Set[str]:
        """Get all existing document IDs from the collection"""
        try:
            # Get all documents in small batches to avoid memory issues
            existing_ids = set()
            batch_size = 1000
            offset = 0
            
            while True:
                results = self.collection.get(
                    limit=batch_size,
                    offset=offset,
                    include=["ids"]
                )
                
                if not results['ids']:
                    break
                    
                existing_ids.update(results['ids'])
                offset += batch_size
                
                # Show progress for large collections
                if offset % 5000 == 0:
                    print(f"Loaded {len(existing_ids)} existing document IDs...")
            
            logging.info(f"Found {len(existing_ids)} existing documents in collection")
            return existing_ids
            
        except Exception as e:
            logging.error(f"Error getting existing document IDs: {e}")
            return set()
    
    def load_and_process_jsonl(self, jsonl_path: str) -> List[Dict]:
        """Load and process JSONL data"""
        data = []
        jsonl_path = Path(jsonl_path)
        
        if not jsonl_path.exists():
            raise FileNotFoundError(f"JSONL file not found: {jsonl_path}")
        
        print("Loading and processing JSONL data...")
        
        # First pass: count total lines for progress bar
        with open(jsonl_path, 'r', encoding='utf-8') as file:
            total_lines = sum(1 for _ in file)
        
        with open(jsonl_path, 'r', encoding='utf-8') as file:
            with tqdm(total=total_lines, desc="Processing JSONL lines", unit="lines") as pbar:
                for line_num, line in enumerate(file, 1):
                    try:
                        item = json.loads(line.strip())
                        
                        # Validate required fields
                        if 'input' not in item or 'output' not in item:
                            logging.warning(f"Line {line_num}: Missing 'input' or 'output' field")
                            pbar.update(1)
                            continue
                        
                        # Clean and validate data
                        input_text = self.clean_text(item['input'])
                        output_text = self.clean_text(item['output'])
                        
                        if not input_text or not output_text:
                            logging.warning(f"Line {line_num}: Empty input or output after cleaning")
                            pbar.update(1)
                            continue
                        
                        # Create processed item
                        processed_item = {
                            'input': input_text,
                            'output': output_text,
                            'doc_id': self.create_document_id(input_text, output_text),
                            'line_number': line_num
                        }
                        
                        data.append(processed_item)
                        pbar.update(1)
                        
                    except json.JSONDecodeError as e:
                        logging.error(f"Line {line_num}: JSON decode error - {e}")
                        pbar.update(1)
                        continue
                    except Exception as e:
                        logging.error(f"Line {line_num}: Processing error - {e}")
                        pbar.update(1)
                        continue
        
        logging.info(f"Processed {len(data)} valid items from {jsonl_path}")
        return data
    
    def filter_new_documents(self, data: List[Dict]) -> List[Dict]:
        """Filter out documents that already exist in the collection"""
        existing_ids = self.get_existing_document_ids()
        
        if not existing_ids:
            logging.info("No existing documents found. All data will be processed.")
            return data
        
        new_data = []
        skipped_count = 0
        
        print("Filtering out already processed documents...")
        for item in tqdm(data, desc="Filtering documents", unit="docs"):
            if item['doc_id'] not in existing_ids:
                new_data.append(item)
            else:
                skipped_count += 1
        
        logging.info(f"Skipped {skipped_count} already processed documents")
        logging.info(f"Found {len(new_data)} new documents to process")
        
        return new_data
    
    def add_documents_batch(self, data: List[Dict], batch_size: int = 1000):
        """Add documents to vector database in batches with detailed progress tracking"""
        if not data:
            logging.info("No new documents to add.")
            return
        
        total_items = len(data)
        total_batches = (total_items + batch_size - 1) // batch_size
        
        logging.info(f"Adding {total_items} documents to vector database in {total_batches} batches...")
        
        successful_batches = 0
        failed_batches = 0
        total_processed = 0
        start_time = time.time()
        
        # Create main progress bar for batches
        with tqdm(total=total_batches, desc="Processing batches", unit="batch", position=0) as batch_pbar:
            
            for batch_idx in range(0, total_items, batch_size):
                batch_num = (batch_idx // batch_size) + 1
                batch = data[batch_idx:batch_idx + batch_size]
                
                # Update batch description with current progress
                batch_pbar.set_description(f"Batch {batch_num}/{total_batches} - {successful_batches} success, {failed_batches} failed")
                
                # Prepare batch data
                batch_ids = []
                batch_embeddings = []
                batch_documents = []
                batch_metadatas = []
                
                # Process items in current batch with sub-progress bar
                batch_start_time = time.time()
                
                with tqdm(total=len(batch), desc=f"Batch {batch_num} items", 
                         unit="item", position=1, leave=False) as item_pbar:
                    
                    for item in batch:
                        try:
                            # Generate embedding for input (query)
                            embedding = self.generate_embedding(item['input'])
                            
                            # Prepare data
                            batch_ids.append(item['doc_id'])
                            batch_embeddings.append(embedding)
                            batch_documents.append(item['input'])  # Store input as document
                            batch_metadatas.append({
                                'input': item['input'],
                                'output': item['output'],
                                'line_number': item['line_number']
                            })
                            
                        except Exception as e:
                            logging.error(f"Error processing item {item['doc_id']}: {e}")
                            continue
                        finally:
                            item_pbar.update(1)
                
                # Add batch to collection
                if batch_ids:
                    try:
                        batch_add_start = time.time()
                        self.collection.add(
                            ids=batch_ids,
                            embeddings=batch_embeddings,
                            documents=batch_documents,
                            metadatas=batch_metadatas
                        )
                        batch_add_time = time.time() - batch_add_start
                        
                        successful_batches += 1
                        total_processed += len(batch_ids)
                        
                        # Calculate and display timing info
                        batch_total_time = time.time() - batch_start_time
                        elapsed_time = time.time() - start_time
                        items_per_sec = total_processed / elapsed_time if elapsed_time > 0 else 0
                        
                        batch_pbar.set_postfix({
                            'Items/sec': f'{items_per_sec:.1f}',
                            'Batch_time': f'{batch_total_time:.1f}s',
                            'Add_time': f'{batch_add_time:.1f}s'
                        })
                        
                    except Exception as e:
                        logging.error(f"Error adding batch {batch_num} to collection: {e}")
                        failed_batches += 1
                else:
                    logging.warning(f"Batch {batch_num} had no valid items to add")
                    failed_batches += 1
                
                batch_pbar.update(1)
        
        # Final summary
        total_time = time.time() - start_time
        avg_items_per_sec = total_processed / total_time if total_time > 0 else 0
        
        print("\n" + "="*60)
        print("BATCH PROCESSING SUMMARY")
        print("="*60)
        print(f"Total batches processed: {successful_batches + failed_batches}")
        print(f"Successful batches: {successful_batches}")
        print(f"Failed batches: {failed_batches}")
        print(f"Total items processed: {total_processed}")
        print(f"Total time: {total_time:.2f} seconds")
        print(f"Average processing speed: {avg_items_per_sec:.2f} items/second")
        print("="*60)
        
        logging.info(f"Successfully added {total_processed} documents to vector database")
    
    def search_similar(self, query: str, n_results: int = 5) -> List[Dict]:
        """Search for similar documents"""
        cleaned_query = self.clean_text(query)
        
        try:
            results = self.collection.query(
                query_texts=[cleaned_query],
                n_results=n_results
            )
            
            # Format results
            formatted_results = []
            if results['documents'] and results['documents'][0]:
                for i in range(len(results['documents'][0])):
                    result = {
                        'input': results['metadatas'][0][i]['input'],
                        'output': results['metadatas'][0][i]['output'],
                        'distance': results['distances'][0][i] if 'distances' in results else None,
                        'line_number': results['metadatas'][0][i]['line_number']
                    }
                    formatted_results.append(result)
            
            return formatted_results
            
        except Exception as e:
            logging.error(f"Search error: {e}")
            return []
    
    def get_collection_stats(self) -> Dict:
        """Get collection statistics"""
        try:
            count = self.collection.count()
            return {
                'total_documents': count,
                'collection_name': self.collection_name,
                'embedding_model': self.embedding_model.get_sentence_embedding_dimension()
            }
        except Exception as e:
            logging.error(f"Error getting stats: {e}")
            return {}

def setup_vector_database(jsonl_path: str, db_path: str = "./chroma_db") -> VectorDatabase:
    """Setup and populate vector database from JSONL file with incremental loading"""
    
    # Initialize vector database
    vector_db = VectorDatabase(db_path=db_path)
    
    # Get current collection statistics
    initial_stats = vector_db.get_collection_stats()
    initial_count = initial_stats.get('total_documents', 0)
    
    print(f"\nCurrent collection contains {initial_count} documents")
    
    # Load and process data
    print("\nStep 1: Loading JSONL data...")
    data = vector_db.load_and_process_jsonl(jsonl_path)
    
    if not data:
        logging.error("No valid data found in JSONL file")
        return vector_db
    
    # Filter out already processed documents
    print("\nStep 2: Filtering new documents...")
    new_data = vector_db.filter_new_documents(data)
    
    if not new_data:
        print("All documents have already been processed!")
        return vector_db
    
    print(f"\nStep 3: Adding {len(new_data)} new documents to vector database...")
    
    # Ask user confirmation before proceeding with large datasets
    if len(new_data) > 1000:
        response = input(f"\nAbout to process {len(new_data)} new documents. Continue? (y/n): ")
        if response.lower() != 'y':
            print("Processing cancelled by user.")
            return vector_db
    
    # Add new documents to vector database
    vector_db.add_documents_batch(new_data)
    
    # Print final statistics
    final_stats = vector_db.get_collection_stats()
    final_count = final_stats.get('total_documents', 0)
    added_count = final_count - initial_count
    
    print(f"\n" + "="*60)
    print("FINAL RESULTS")
    print("="*60)
    print(f"Documents at start: {initial_count}")
    print(f"Documents added: {added_count}")
    print(f"Total documents now: {final_count}")
    print(f"Collection: {final_stats.get('collection_name', 'N/A')}")
    print(f"Embedding dimension: {final_stats.get('embedding_model', 'N/A')}")
    print("="*60)
    
    return vector_db

# Example usage and testing
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    
    # Setup vector database with incremental loading
    jsonl_path = "../models/farmer_qa_dataset.jsonl"
    vector_db = setup_vector_database(jsonl_path)
    
    # Test search functionality
    test_queries = [
        "How much sugarcane is produced in Odisha?",
        "What is the best fertilizer for wheat?",
        "Rice farming techniques"
    ]
    
    print("\n" + "="*50)
    print("TESTING VECTOR DATABASE SEARCH")
    print("="*50)
    
    for query in test_queries:
        print(f"\nQuery: {query}")
        print("-" * 30)
        
        results = vector_db.search_similar(query, n_results=3)
        
        if results:
            for i, result in enumerate(results, 1):
                print(f"{i}. Input: {result['input'][:100]}...")
                print(f"   Output: {result['output'][:150]}...")
                if result['distance']:
                    print(f"   Similarity: {1 - result['distance']:.3f}")
                print()
        else:
            print("No results found")
    
    # Print final statistics
    stats = vector_db.get_collection_stats()
    print(f"\nFinal Database Stats: {stats}")