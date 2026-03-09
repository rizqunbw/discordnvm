FROM node:20-alpine

# Buat directory app
WORKDIR /app

# Copy package.json dan install dependency
COPY package*.json ./
RUN npm install

# Copy semua file bot
COPY . .

# Expose port (biar Hugging Face tau ada web server jalan)
EXPOSE 3000

# Start bot
CMD ["npm", "start"]
