const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const port = process.env.PORT || 5000;

const app = express();

//middleware

app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ltn8juo.mongodb.net/?retryWrites=true&w=majority`;
// console.log(uri);

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });



const run = async() => {
    try{
        const appointmentOptionCollection = client.db("doctorsPortal").collection("AppointmentOptions")
        const bookingsCollection = client.db("doctorsPortal").collection("bookings")
        
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

        app.post("/bookings", async(req, res)=>{
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

        app.get("/bookings", async(req, res)=>{
            const query = {};
            const result = await bookingsCollection.find(query).toArray();
            res.send(result);
        })


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