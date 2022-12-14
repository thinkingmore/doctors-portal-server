const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const { response } = require('express');
const stripe = require("stripe")('sk_test_51M6vglHfkXGzXdUeF7gd0dVqp6jnHIlJ83eBB0wq74Kgp0KUg6HykENn0U29wVFcufQQj0nV7DpzjVIW7TgcVkvq00xN1hBqk6');
require('dotenv').config();



const port = process.env.PORT || 5000;

const app = express();

//middleware

app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ltn8juo.mongodb.net/?retryWrites=true&w=majority`;
// console.log(uri);

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

// verifying jwt token

const verifyJWT = (req,res, next) => {
    // console.log('token inside verifyJWT', req.headers.authorization);
    const authHeader = req.headers.authorization;
    if(!authHeader){
        return res.status(401).send("unauthorized access")
    }

    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN, (error,decoded) => {
        if(error){
            return res.status(403).send({message:"Forbidden Access"});
        }
        req.decoded = decoded;
        next();
    })
}


const run = async() => {
    try{
        const appointmentOptionCollection = client.db("doctorsPortal").collection("AppointmentOptions")
        const bookingsCollection = client.db("doctorsPortal").collection("bookings")
        const usersCollection = client.db("doctorsPortal").collection("users")
        const doctorsCollection = client.db("doctorsPortal").collection("doctors")
        
        //Note: make sure you run verifyAdmin after verifyJWT
        const verifyAdmin = async(req,res,next) =>{
            const decodedEmail= req.decoded.email;
            const query = {email: decodedEmail};
            const user = await usersCollection.findOne(query);

            if(user?.role !== 'admin'){
                return res.status(403).send({message: "Forbidden Access"});
            }
            next();
        }
        
        
        
        // collecting multiple data by aggregating query
        app.get("/appointmentOptions", async(req, res)=>{
            const date = req.query.date;
            console.log(date);
            const query = {};
            const options = await appointmentOptionCollection.find(query).toArray();

            // getting booking information by date
            const bookingQuery = {appointmentDate: date};
            const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();

            //finding booked slots
            options.forEach(option=>{
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name)
                const bookedSlot = optionBooked.map(book => book.slot )
                const remainingSlots = option.slots.filter(slot=> !bookedSlot.includes(slot))
                option.slots = remainingSlots;
                console.log(date, option.name, remainingSlots.length);
            })
            res.send(options);
        })

        app.get("/appointmentSpeciality", async(req, res)=>{
            const query = {}
            const result = await appointmentOptionCollection.find(query).project({name: 1}).toArray();
            res.send(result);

        })

        // api for posting doctors data
        app.post("/doctors", verifyJWT,verifyAdmin, async(req,res)=>{
            const doctor = req.body;
            const result = await doctorsCollection.insertOne(doctor);
            res.send(result);
        })

        app.get("/doctors", verifyJWT,verifyAdmin, async(req, res)=>{
            const query = {};
            const result = await doctorsCollection.find(query).toArray();
            res.send(result);
        })

        app.delete("/doctors/:id", verifyJWT,verifyAdmin,async(req,res)=>{
            const id = req.params.id;
            const doctor = { _id: ObjectId(id)};
            const result = await doctorsCollection.deleteOne(doctor);
            res.send(result);
        })

        //api for getting and posting booking data

        app.post("/bookings",async(req, res)=>{
            const booking = req.body;
            console.log(booking);
            const query = {
                appointmentDate: booking.appointmentDate,
                email: booking.email,
                treatment: booking.treatment

            }

            const alreadyBooked = await bookingsCollection.find(query).toArray();
            if(alreadyBooked.length){
                const message = `You already have a booking on ${booking.appointmentDate}`;
                return(res.send({acknowledged: false,message}))
            }
           
            const result = await bookingsCollection.insertOne(booking);
            res.send(result);
        })

        // app.get("/bookings", async(req, res)=>{
        //     const query = {};
        //     const result = await bookingsCollection.find(query).toArray();
        //     res.send(result);
        // })

        app.get("/bookings",verifyJWT,async(req, res)=>{
            const email = req.query.email;
            const decodedEmail = req.decoded.email;

            if(email !== decodedEmail ){
                return res.status(403).send({message: "Forbidden Access"})
            }
            const query = { email : email};
            const bookings = await bookingsCollection.find(query).toArray();
            res.send(bookings);
        })

        app.get('/bookings/:id', async(req,res)=>{
            const id = req.params.id;
            const query = { _id: ObjectId(id)};
            const booking = await bookingsCollection.findOne(query);
            res.send(booking);
        })

        // API for Stripe
        app.post('/create-payment-intent',async(req,res)=>{
            const booking = req.body;
            const price = booking.price;
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                currency: "usd",
                amount: amount,
                "payment_method_types": [
                    "card"
                ]
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
              });
            
        })

        // API for generating jwt token
        app.get("/jwt", async(req,res)=>{
            const email = req.query.email;
            const query = {email: email};
            const user = await usersCollection.findOne(query);
            if(user){
                const token = jwt.sign({email}, process.env.ACCESS_TOKEN ,{expiresIn: "1h"});
                return res.send({accessToken: token});
            }
            console.log(user);
            res.status(403).send({accessToken: ''});
           
        })


        // post users data

        app.get("/users", async(req, res)=>{
            const query = {};
            const result = await usersCollection.find(query).toArray();
            res.send(result);
        })
        app.post("/users", async(req, res)=>{
            const user = req.body;
            const result = await usersCollection.insertOne(user);
        
            res.send(result);
        })

        app.get('/users/admin/:email',async(req,res)=>{
            const email = req.params.email;
            const query = { email }
            const user = await usersCollection.findOne(query);
            res.send({isAdmin: user?.role === 'admin' });

        })

        app.put('/users/admin/:id',verifyJWT, async(req, res)=>{
            const decodedEmail = req.decoded.email;
            const query = { email: email}
            const user = await usersCollection.findOne(query);
            if(user?.role !== 'admin'){
                return res.status(403).send({message: "Forbidden Access"})
            }
            const id = req.params.id;
            const filter = { _id: ObjectId(id)};
            const options = {upsert : true};
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc, options);
            res.send(result);
        })

        // temporary to update price field on appointmentOptions
        // app.get('/addPrice',async(req,res)=>{
        //     const filter = {}
        //     const options = { upsert: true }
        //     const updatedDoc = {
        //         $set: {
        //             price: 99
        //         }
        //     }
        //     const result = await appointmentOptionCollection.updateMany(filter,updatedDoc,options);
        //     res.send(result);
        // })
    }

    finally{

    }
}
run().catch(console.log)


app.get('/', async(req, res)=>{
    res.send('doctors portal server is running')
})

app.listen(port, ()=>{
    console.log(`doctors portal server is running on ${port}`)
})