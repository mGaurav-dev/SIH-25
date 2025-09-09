from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.schema import HumanMessage, SystemMessage
from langchain.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
import logging
import re
from typing import List, Dict, Optional
from services.vectordb import VectorDatabase

class AgriculturalLLMService:
    def __init__(self, api_key: str, vector_db: Optional[VectorDatabase] = None):
        try:
            # Initialize Gemini LLM
            self.llm = ChatGoogleGenerativeAI(
                model="gemini-1.5-flash",
                google_api_key=api_key,
                temperature=0.3,  # Lower temperature for more consistent responses
                convert_system_message_to_human=True
            )
            
            # Initialize vector database
            self.vector_db = vector_db
            
            # Enhanced agricultural prompt with RAG integration
            self.agricultural_prompt = PromptTemplate(
                input_variables=["query", "location", "weather", "context"],
                template="""
You are an expert agricultural advisor with extensive knowledge of farming practices, crops, soil management, and weather conditions.

Query: {query}
Location: {location}
Current Weather: {weather}

Relevant Knowledge Context:
{context}

Instructions for your response:
1. Provide a direct, accurate, and concise answer to the farmer's specific question
2. Use the provided context knowledge to enhance your response accuracy
3. Consider the location's climate, soil conditions, and seasonal patterns
4. Factor in current weather conditions when relevant
5. Keep the response practical and actionable for farmers
6. Use simple, clear language without technical jargon
7. Provide specific numbers, quantities, or measurements when available
8. Do not use any special characters, symbols, or formatting markers
9. Keep the response between 2-4 sentences for conciseness
10. If the context doesn't contain relevant information, use your general agricultural knowledge

Response:
"""
            )
            
            # Create processing chain
            self.output_parser = StrOutputParser()
            self.agricultural_chain = self.agricultural_prompt | self.llm | self.output_parser
            
        except Exception as e:
            logging.error(f"Failed to initialize Enhanced LLM service: {e}")
            raise
    
    def clean_response(self, response: str) -> str:
        """Clean and format the response"""
        if not response:
            return "I couldn't generate a proper response. Please try again."
        
        # Remove special characters and symbols
        response = re.sub(r'[*#_`~\[\]{}|\\]', '', response)
        
        # Remove multiple spaces and normalize
        response = ' '.join(response.split())
        
        # Remove any remaining markdown-like formatting
        response = re.sub(r'\*\*(.*?)\*\*', r'\1', response)  # Remove bold
        response = re.sub(r'\*(.*?)\*', r'\1', response)      # Remove italic
        response = re.sub(r'`(.*?)`', r'\1', response)        # Remove code
        
        # Ensure proper sentence structure
        response = response.strip()
        if response and not response.endswith(('.', '!', '?')):
            response += '.'
        
        return response
    
    def get_relevant_context(self, query: str, n_results: int = 3) -> str:
        """Retrieve relevant context from vector database"""
        if not self.vector_db:
            return "No additional context available."
        
        try:
            # Search for similar questions
            results = self.vector_db.search_similar(query, n_results=n_results)
            
            if not results:
                return "No specific context found for this query."
            
            # Format context from search results
            context_parts = []
            for i, result in enumerate(results, 1):
                similarity_score = 1 - result.get('distance', 1) if result.get('distance') else 0
                
                # Only include results with reasonable similarity
                if similarity_score > 0.5:
                    context_parts.append(
                        f"Example {i}: Q: {result['input']} A: {result['output']}"
                    )
            
            if context_parts:
                return "\n".join(context_parts[:3])  # Limit to top 3
            else:
                return "No highly relevant context found."
                
        except Exception as e:
            logging.error(f"Error retrieving context: {e}")
            return "Context retrieval failed."
    
    def generate_response(self, query: str, location: str, weather_info: Dict) -> str:
        """Generate enhanced response using RAG"""
        try:
            # Get relevant context from vector database
            context = self.get_relevant_context(query)
            
            # Format weather information
            weather_str = self._format_weather(weather_info)
            
            # Generate response using the chain
            response = self.agricultural_chain.invoke({
                "query": query,
                "location": location,
                "weather": weather_str,
                "context": context
            })
            
            # Clean and return response
            cleaned_response = self.clean_response(response)
            
            # Validate response quality
            if len(cleaned_response.split()) < 5:
                return self._generate_fallback_response(query, location, weather_info)
            
            return cleaned_response
            
        except Exception as e:
            logging.error(f"Enhanced LLM response generation failed: {e}")
            return self._generate_fallback_response(query, location, weather_info)
    
    def _generate_fallback_response(self, query: str, location: str, weather_info: Dict) -> str:
        """Generate fallback response when main generation fails"""
        try:
            # Simple fallback prompt
            fallback_prompt = f"""
            As an agricultural expert, provide a brief answer to: {query}
            Location: {location}
            Keep the response simple, practical, and under 3 sentences.
            """
            
            # Direct LLM call for fallback
            messages = [HumanMessage(content=fallback_prompt)]
            response = self.llm.invoke(messages)
            
            return self.clean_response(response.content)
            
        except Exception as e:
            logging.error(f"Fallback response generation failed: {e}")
            return "I apologize, but I'm unable to provide a response right now. Please try again later or rephrase your question."
    
    def batch_generate_responses(self, batch_data: List[Dict]) -> List[str]:
        """Generate responses for multiple queries efficiently"""
        responses = []
        
        for data in batch_data:
            try:
                response = self.generate_response(
                    data.get('query', ''),
                    data.get('location', ''),
                    data.get('weather_info', {})
                )
                responses.append(response)
            except Exception as e:
                logging.error(f"Batch processing failed for item: {e}")
                responses.append("Error generating response for this query.")
        
        return responses
    
    def _format_weather(self, weather_info: Dict) -> str:
        """Format weather information for prompt"""
        if not weather_info:
            return "Weather information not available"
        
        parts = []
        if weather_info.get('temperature'):
            parts.append(f"Temperature: {weather_info['temperature']}°C")
        if weather_info.get('description'):
            parts.append(f"Conditions: {weather_info['description']}")
        if weather_info.get('humidity'):
            parts.append(f"Humidity: {weather_info['humidity']}%")
        if weather_info.get('wind_speed'):
            parts.append(f"Wind: {weather_info['wind_speed']} m/s")
        
        return ", ".join(parts) if parts else "Weather information not available"
    
    def evaluate_response_quality(self, query: str, response: str) -> Dict:
        """Evaluate the quality of generated response"""
        quality_metrics = {
            'length_appropriate': 10 <= len(response.split()) <= 100,
            'no_special_chars': not re.search(r'[*#_`~\[\]{}|\\]', response),
            'has_specific_info': any(char.isdigit() for char in response),
            'ends_properly': response.endswith(('.', '!', '?')),
            'addresses_query': len(set(query.lower().split()) & set(response.lower().split())) > 0
        }
        
        quality_score = sum(quality_metrics.values()) / len(quality_metrics)
        
        return {
            'score': quality_score,
            'metrics': quality_metrics,
            'word_count': len(response.split())
        }

# Integration class for easy setup
class RAGAgriculturalSystem:
    def __init__(self, api_key: str, jsonl_path: str, db_path: str = "./chroma_db"):
        """Initialize complete RAG system"""
        self.api_key = api_key
        self.jsonl_path = jsonl_path
        self.db_path = db_path
        
        # Setup components
        self._setup_system()
    
    def _setup_system(self):
        """Setup vector database and LLM service"""
        logging.info("Setting up RAG Agricultural System...")
        
        # Initialize vector database
        from vectordb import setup_vector_database
        self.vector_db = setup_vector_database(self.jsonl_path, self.db_path)
        
        # Initialize enhanced LLM service
        self.llm_service = AgriculturalLLMService(
            api_key=self.api_key,
            vector_db=self.vector_db
        )
        
        logging.info("RAG Agricultural System setup complete!")
    
    def query(self, question: str, location: str, weather_info: Dict = None) -> Dict:
        """Main query interface"""
        if weather_info is None:
            weather_info = {}
        
        response = self.llm_service.generate_response(question, location, weather_info)
        quality_eval = self.llm_service.evaluate_response_quality(question, response)
        
        return {
            'question': question,
            'response': response,
            'quality_score': quality_eval['score'],
            'location': location,
            'weather': weather_info
        }
    
    def get_system_stats(self) -> Dict:
        """Get system statistics"""
        vector_stats = self.vector_db.get_collection_stats()
        return {
            'vector_db_stats': vector_stats,
            'system_status': 'operational',
            'components': ['vector_db', 'llm_service', 'rag_integration']
        }

# Example usage and testing
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    
    # Configuration
    API_KEY = "your_google_api_key_here"  # Replace with actual API key
    JSONL_PATH = "models/farmer_qa_dataset.jsonl"
    
    try:
        # Initialize RAG system
        rag_system = RAGAgriculturalSystem(
            api_key=API_KEY,
            jsonl_path=JSONL_PATH
        )
        
        # Test queries
        test_cases = [
            {
                'question': "How much sugarcane is produced in Odisha?",
                'location': "Bhubaneswar, Odisha, India",
                'weather': {'temperature': 28, 'description': 'partly cloudy', 'humidity': 75}
            },
            {
                'question': "What is the best fertilizer for wheat cultivation?",
                'location': "Ludhiana, Punjab, India", 
                'weather': {'temperature': 15, 'description': 'clear sky', 'humidity': 60}
            },
            {
                'question': "When should I plant rice?",
                'location': "Kolkata, West Bengal, India",
                'weather': {'temperature': 30, 'description': 'monsoon', 'humidity': 85}
            }
        ]
        
        print("\n" + "="*60)
        print("TESTING ENHANCED RAG AGRICULTURAL SYSTEM")
        print("="*60)
        
        for i, test_case in enumerate(test_cases, 1):
            print(f"\nTest Case {i}:")
            print(f"Question: {test_case['question']}")
            print(f"Location: {test_case['location']}")
            print("-" * 40)
            
            result = rag_system.query(
                test_case['question'],
                test_case['location'],
                test_case['weather']
            )
            
            print(f"Response: {result['response']}")
            print(f"Quality Score: {result['quality_score']:.2f}")
            print()
        
        # System statistics
        stats = rag_system.get_system_stats()
        print(f"System Stats: {stats}")
        
    except Exception as e:
        logging.error(f"System initialization failed: {e}")
        print("Please ensure you have:")
        print("1. Valid Google API key")
        print("2. JSONL file at the specified path")
        print("3. Required packages installed")